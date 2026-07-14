const status=document.querySelector('#status'),items=document.querySelector('#items');
const bookmarks=window.openai?.toolOutput?.bookmarks||[];
status.textContent=bookmarks.length?`${bookmarks.length} 个收藏`:'这个任务还没有收藏';
for(const item of bookmarks){const row=document.createElement('div');row.className='item';const icon=item.kind==='url'?'🔗':item.kind==='directory'?'📁':item.kind==='image'?'🖼️':'📄';const label=document.createElement('span');label.textContent=`${icon} ${item.title}`;label.title=item.target;row.append(label);items.append(row)}
document.querySelector('#pip').addEventListener('click',async()=>{if(!window.openai?.requestDisplayMode)return status.textContent='当前宿主不支持悬浮模式';try{await window.openai.requestDisplayMode({mode:'pip'})}catch{status.textContent='当前宿主拒绝了悬浮模式'}});
