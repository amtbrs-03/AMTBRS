// lib/mojibake.js
// Turkish character encoding fix - shared utility

export function initMojibakeFix() {
  const root = document.documentElement;
  const mapSeq = [
    [/Ã¼/g,'ü'],[/Ã¶/g,'ö'],[/ÅŸ/g,'ş'],[/Ä±/g,'ı'],[/ÄŸ/g,'ğ'],[/Ã§/g,'ç'],
    [/Ãœ/g,'Ü'],[/Ã–/g,'Ö'],[/Åž/g,'Ş'],[/Ä°/g,'İ'],[/Äž/g,'Ğ'],[/Ã‡/g,'Ç']
  ];
  
  function needsFix(str){ 
    return /Ã|Ä|Å/.test(str); 
  }
  
  function byteReDecode(str){
    try { 
      const bytes = new Uint8Array(str.length); 
      for (let i=0;i<str.length;i++) bytes[i]=str.charCodeAt(i)&0xFF; 
      return new TextDecoder().decode(bytes);
    } catch(e){
      return str;
    }
  }
  
  function fix(str){
    let out=str; 
    mapSeq.forEach(([re,rep])=>{ out=out.replace(re,rep); });
    if (needsFix(out)){ 
      const rede=byteReDecode(out); 
      if (!needsFix(rede)) out=rede; 
    }
    return out;
  }
  
  function sweep(){
    if (!(document && document.body)) return;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null);
    while(walker.nextNode()){
      const n=walker.currentNode; 
      const t=n.nodeValue; 
      if(t && needsFix(t)){ 
        const f=fix(t); 
        if(f!==t) n.nodeValue=f; 
      }
    }
  }
  
  function reveal(){ 
    if(root) root.classList.remove('__fixing'); 
  }
  
  function runAll(){ 
    sweep();
    let c=0; 
    const timer=setInterval(()=>{ 
      sweep(); 
      if(++c>2){ 
        clearInterval(timer); 
        reveal(); 
      } 
    },150); 
  }
  
  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', runAll); 
  } else {
    runAll();
  }
}
