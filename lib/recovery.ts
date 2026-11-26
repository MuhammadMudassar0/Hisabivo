import {supabase} from './supabase';
import {receiptMaxBytes,validateReceiptFile,type Receipt} from './receipts';
export type TrashRecord={kind:'ledger_transactions'|'ledger_loans'|'ledger_loan_payments';id:string;deleted_at:string;data:Record<string,unknown>};
export type AuditEvent={id:string;entity_type:string;entity_id:string;action:string;actor_id:string|null;before_data:Record<string,unknown>|null;after_data:Record<string,unknown>|null;created_at:string};
export const backupTables=['ledger_accounts','ledger_account_transfers','ledger_categories','ledger_transactions','ledger_expense_payments','ledger_loans','ledger_loan_payments','ledger_schedules','ledger_occurrences','ledger_employees','ledger_salary_advances','ledger_salary_statements','ledger_templates','ledger_receipts'] as const;
export type WorkspaceBackup={format:'hisabivo-workspace-v1';owner_id:string;workspace_id:string;created_at:string;tables:Record<string,Record<string,unknown>[]>;attachments?:{path:string;mime:string;base64:string}[]};
function validBase64(value:unknown):value is string{if(typeof value!=='string'||!value.length||value.length>7_000_000||value.length%4!==0||/[^A-Za-z0-9+/=]/.test(value))return false;const padding=value.indexOf('=');return padding<0||(padding>=value.length-2&&/^={1,2}$/.test(value.slice(padding)));}
function check(error:{code?:string;message:string}|null){if(error)throw new Error(['PGRST202','PGRST205','42703','42P01'].includes(error.code||'')?'Run setup-suite.sql to enable audit, recovery, and workspace backups.':error.message);}
export async function fetchRecovery(owner:string,readOnly=false){const audit=await supabase().from('ledger_audit_events').select('*').eq('user_id',owner).order('created_at',{ascending:false}).limit(200);check(audit.error);let trash:TrashRecord[]=[];if(!readOnly){const result=await supabase().rpc('ledger_list_trash',{p_owner:owner});check(result.error);trash=(result.data||[]) as TrashRecord[];}return{events:(audit.data||[]) as AuditEvent[],trash};}
export async function restoreRecord(kind:string,id:string){const{error}=await supabase().rpc('ledger_restore_record',{p_kind:kind,p_id:id});check(error);}
export async function createWorkspaceBackup(owner:string,workspace:string,includeFiles=false):Promise<WorkspaceBackup>{
 const tables:WorkspaceBackup['tables']={};for(const table of backupTables){const rows:Record<string,unknown>[]=[];for(let start=0;;start+=1000){const{data,error}=await supabase().from(table).select('*').eq('user_id',owner).eq('workspace_id',workspace).order('id').range(start,start+999);check(error);rows.push(...data!);if(data!.length<1000)break;}tables[table]=rows;}
 const backup:WorkspaceBackup={format:'hisabivo-workspace-v1',owner_id:owner,workspace_id:workspace,created_at:new Date().toISOString(),tables};
 if(includeFiles){backup.attachments=[];let total=0;for(const row of tables.ledger_receipts||[]){const receipt=row as unknown as Receipt;const{data,error}=await supabase().storage.from('ledger-receipts').download(receipt.object_path);if(error)throw new Error(`Could not include receipt ${receipt.file_name}. No incomplete backup was downloaded.`);const bytes=new Uint8Array(await data!.arrayBuffer());total+=bytes.length;if(total>25_000_000)throw new Error('Receipt files exceed 25 MB. Export a metadata backup and download receipt files separately.');let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);backup.attachments.push({path:receipt.object_path,mime:receipt.mime_type,base64:btoa(binary)});}}
 return backup;
}
export function validateBackup(value:unknown,owner:string,workspace:string):asserts value is WorkspaceBackup{
 const v=value as WorkspaceBackup;
 if(!v||v.format!=='hisabivo-workspace-v1'||v.owner_id!==owner||v.workspace_id!==workspace||!v.tables||typeof v.tables!=='object'||Array.isArray(v.tables))throw new Error('Choose a backup for this owner and the currently selected workspace.');
 for(const[name,rows]of Object.entries(v.tables))if(!backupTables.includes(name as typeof backupTables[number])||!Array.isArray(rows)||rows.length>10000||rows.some(r=>!r||r.user_id!==owner||r.workspace_id!==workspace))throw new Error('The backup contains invalid or out-of-scope records.');
 if(v.attachments!==undefined&&!Array.isArray(v.attachments))throw new Error('Invalid receipt files.');
 const metadata=new Map((v.tables.ledger_receipts||[]).map(row=>[String(row.object_path),row]));const seen=new Set<string>();let total=0;
 for(const f of v.attachments||[]){
  if(!f||typeof f.path!=='string'||!f.path.startsWith(`${owner}/${workspace}/`)||!/^[-\w]+\/[-\w]+\/[-\w]+\/[\w.-]+$/.test(f.path)||!validBase64(f.base64)||!['application/pdf','image/jpeg','image/png','image/webp'].includes(f.mime))throw new Error('A receipt file does not belong to this workspace or has invalid encoding.');
  if(seen.has(f.path))throw new Error('The backup contains a duplicate receipt file.');seen.add(f.path);
  const receipt=metadata.get(f.path);if(!receipt||receipt.mime_type!==f.mime||typeof receipt.file_name!=='string'||!receipt.file_name||!Number.isSafeInteger(receipt.size_bytes))throw new Error('Every receipt file must match its backup metadata.');
  const bytes=f.base64.length/4*3-(f.base64.endsWith('==')?2:f.base64.endsWith('=')?1:0);
  if(bytes<=0||bytes>receiptMaxBytes||receipt.size_bytes!==bytes)throw new Error('A receipt’s decoded size does not match its metadata, or exceeds 5 MB.');
  const extension=f.mime==='application/pdf'?'pdf':f.mime==='image/jpeg'?'jpg':f.mime==='image/png'?'png':'webp';
  if(f.path!==`${owner}/${workspace}/${receipt.entry_id}/${receipt.id}.${extension}`)throw new Error('A receipt path does not match its owner, workspace, record and file identity.');
  total+=bytes;if(total>25_000_000)throw new Error('Receipt files exceed the 25 MB backup limit.');
 }
}

/** Validate every attachment before the financial-restore RPC can mutate anything. */
export async function validateBackupAttachments(backup:WorkspaceBackup){
 validateBackup(backup,backup.owner_id,backup.workspace_id);
 const metadata=new Map((backup.tables.ledger_receipts||[]).map(row=>[String(row.object_path),row]));
 const validated:{attachment:NonNullable<WorkspaceBackup['attachments']>[number];bytes:Uint8Array}[]=[];
 for(const attachment of backup.attachments||[]){
  let decoded:string;try{decoded=atob(attachment.base64);}catch{throw new Error('A receipt has invalid base64 encoding.');}
  if(btoa(decoded)!==attachment.base64)throw new Error('A receipt has a non-canonical base64 encoding.');
  const bytes=Uint8Array.from(decoded,character=>character.charCodeAt(0)),receipt=metadata.get(attachment.path)!;
  if(bytes.length!==receipt.size_bytes||bytes.length>receiptMaxBytes)throw new Error('A receipt’s decoded bytes do not match its declared size.');
  await validateReceiptFile(new File([Uint8Array.from(bytes).buffer],String(receipt.file_name),{type:attachment.mime}));
  validated.push({attachment,bytes});
 }
 return validated;
}

export async function restoreWorkspaceBackup(backup:WorkspaceBackup,requestId:string){
 const validated=await validateBackupAttachments(backup);
 const{attachments:_attachments,...payload}=backup;
 const{data,error}=await supabase().rpc('ledger_restore_backup',{p_payload:payload,p_request:requestId});check(error);
 let files=0;for(const{attachment,bytes}of validated){const{error:uploadError}=await supabase().storage.from('ledger-receipts').upload(attachment.path,bytes,{contentType:attachment.mime,upsert:false});if(uploadError&&!/already exists|duplicate/i.test(uploadError.message))throw new Error('Records restored, but a receipt upload failed. Retry the same backup to finish remaining files.');files++;}
 return{...(data as {inserted:number;kept:number}),files};
}
export function downloadJson(value:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
