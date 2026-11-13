(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  function create(state,options){
    let generation=0,synced=0,pending=null,inFlight=null,timer=null,retryDelay=1000,error='',conflict=false;
    const draft=options.draft;
    const conflictMessage='別のタブで回答が更新されています。この端末の下書きは保持しています。ほかのタブを閉じ、管理者にご連絡ください。';
    if(draft&&state.status!=='submitted'){
      const acked=draft.pending&&state.lastRequestId===draft.pending.id&&state.revision===draft.pending.revision+1;
      if((draft.version&&draft.version!==state.version)||(draft.revision!==state.revision&&!acked))throw new Error(conflictMessage);
      state.answers=options.validate(draft.answers);
      state.position=Math.max(0,Math.min(state.items.length,draft.position|0));
      generation=Number.isInteger(draft.generation)?draft.generation:1;
      synced=Number.isInteger(draft.synced)?draft.synced:0;
      pending=draft.pending||null;
      if(acked){synced=pending.generation;pending=null;}
    }
    function snapshot(){return {version:state.version,revision:state.revision,answers:state.answers,position:state.position,generation,synced,pending};}
    function persist(){options.persist(state.status==='submitted'?null:snapshot());}
    function dirty(){return generation>synced||Boolean(pending);}
    function status(){return {dirty:dirty(),saving:Boolean(inFlight),error,conflict,finalizing:Boolean(pending&&pending.finalize)};}
    function notify(){if(options.onStatus)options.onStatus(status());}
    function cancelTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
    function schedule(delay=800){
      if(conflict||state.status==='submitted'||(pending&&pending.finalize)||!dirty())return;
      if(delay===0)cancelTimer();
      if(timer!==null||inFlight)return;
      timer=setTimeout(()=>{timer=null;flush(false).catch(()=>{});},delay);
    }
    async function flush(finalize=false){
      cancelTimer();
      if(conflict)throw new Error(conflictMessage);
      if(inFlight){await inFlight;return flush(finalize);}
      if(state.status==='submitted')return;
      const run=async()=>{
        while(dirty()||(finalize&&state.status!=='submitted')){
          if(!pending)pending={id:options.requestId(),revision:state.revision,answers:copy(state.answers),position:state.position,finalize,generation};
          persist(); // Persist request identity before transmission; retries use this exact payload.
          const sent=pending,reply=await options.send(sent);
          if(reply.status!=='submitted'&&(reply.lastRequestId!==sent.id||reply.revision!==sent.revision+1))throw new Error('別のタブで回答が更新されています。');
          state.revision=reply.revision;state.updatedAt=reply.updatedAt;state.status=reply.status;
          if(reply.completedAt)state.completedAt=reply.completedAt;
          state.lastRequestId=reply.lastRequestId;
          synced=sent.generation;pending=null;error='';retryDelay=1000;
          // Never replace live answers/position with a response to an older snapshot.
          if(state.status==='submitted')synced=generation;
          persist();notify();
          if(state.status==='submitted')break;
        }
      };
      inFlight=Promise.resolve().then(run);
      notify();
      try{await inFlight;}
      catch(e){
        error=e.message||String(e);conflict=/別のタブ/.test(error);
        try{persist();}catch(_){}
        throw e;
      }finally{
        inFlight=null;notify();
        if(dirty()&&!conflict&&state.status!=='submitted'){
          schedule(retryDelay);retryDelay=Math.min(retryDelay*2,30000);
        }
      }
    }
    function changed(){generation++;persist();notify();schedule();}
    function retry(){retryDelay=1000;schedule(0);}
    function dispose(){cancelTimer();}
    persist();notify();
    return {changed,persist,flush,schedule,retry,status,dispose};
  }
  const api={create};if(typeof module!=='undefined')module.exports=api;root.StudySync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
