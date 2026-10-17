'use strict';
window.SD = (() => {
  let client, timer, view=0, current, locked=false, endAt=0;
  const el=id=>document.getElementById(id);
  const config=()=>window.MCHEM_RANKING||{};
  const configured=()=>/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config().url)&&!!config().publishableKey;
  const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function api(){
    if(!configured())throw Error('NOT_CONFIGURED');
    if(!client)client=window.supabase.createClient(config().url,config().publishableKey,{auth:{flowType:'pkce',storageKey:'mchem-google-session',detectSessionInUrl:true}});
    return client;
  }
  function leave(){view++;clearInterval(timer);locked=false;}
  function message(e){
    const t=String(e?.message||e);
    for(const [k,v] of Object.entries({NOT_CONFIGURED:'ランキングの準備中です。',NAME_FIXED:'一度登録した名前は変更できません。',NAME_TAKEN:'この名前は使われています。別の名前にしてください。',INVALID_NAME:'名前は1〜16文字で入力してください。',LOGIN_REQUIRED:'Googleアカウントでログインしてください。',NO_QUESTIONS:'問題の準備中です。',NOT_FINISHED:'挑戦中は記録を登録できません。'}))if(t.includes(k))return v;
    return '通信できませんでした。接続を確認して、もう一度お試しください。';
  }
  function error(e){if(el('sdMessage'))el('sdMessage').textContent=message(e);}
  async function rpc(name,args={}){
    const sent=performance.now();
    const {data,error}=await api().rpc(name,args);
    if(error)throw error;
    if(data?.status==='playing')endAt=performance.now()+Math.max(0,Date.parse(data.deadline)-Date.parse(data.serverNow)-(performance.now()-sent)/2);
    return data;
  }
  function shell(body){el('app').innerHTML=`<section class="panel suddenPanel"><div class="countRow"><h2>サドンデス</h2><button class="plain" id="sdBack">戻る</button></div>${body}<p id="sdMessage" class="sdMessage" role="status"></p></section>`;el('sdBack').onclick=()=>{leave();home();};}
  async function open(){
    leave();const token=view;
    shell('<p>読み込み中…</p>');window.scrollTo(0,0);
    if(!configured()){shell('<p>ランキングの準備中です。</p>');return;}
    if(!navigator.onLine){shell('<p>サドンデスにはインターネット接続が必要です。</p><button class="secondary listLink" id="sdReload">再読み込み</button>');el('sdReload').onclick=open;return;}
    try{
      const {data,error:authError}=await api().auth.getSession();if(authError)throw authError;
      if(token!==view)return;
      if(!data.session){lobby(null);return;}
      const status=await rpc('sd_status');if(token!==view)return;
      current=status;
      if(status.status==='playing')play(status);else if(status.status==='finished')finish(status);else lobby(status);
    }catch(e){if(token===view){shell('<button class="secondary listLink" id="sdReload">再読み込み</button>');el('sdReload').onclick=open;error(e);}}
  }
  function lobby(status){
    shell(`<p class="sdRules">1問15秒 · 間違えたら終了 · 1日1回</p><p class="note">2017〜2026年度の本試験を除く全範囲<br>毎日0時（日本時間）に挑戦回数が戻ります。</p>${status?.nickname?`<p class="sdName">${html(status.nickname)}</p>`:''}<button class="primary" id="sdStart">${status?'挑戦する':'Googleでログイン'}</button><button class="secondary listLink" id="sdBoard">ランキング</button>${status?'<button class="plain below" id="sdLogout">ログアウト</button>':''}`);
    el('sdBoard').onclick=board;
    el('sdStart').onclick=async()=>{
      const token=view;el('sdStart').disabled=true;
      try{
        if(!status){const url=new URL('./',location.href);url.searchParams.set('sudden','1');const {error}=await api().auth.signInWithOAuth({provider:'google',options:{redirectTo:url.href}});if(error)throw error;return;}
        const s=await rpc('sd_start');if(token!==view)return;current=s;s.status==='playing'?play(s):finish(s);
      }catch(e){if(token===view){error(e);if(el('sdStart'))el('sdStart').disabled=false;}}
    };
    if(el('sdLogout'))el('sdLogout').onclick=async()=>{const token=view;const {error:e}=await api().auth.signOut({scope:'local'});if(token!==view)return;if(e)error(e);else open();};
  }
  function play(s){
    clearInterval(timer);current=s;locked=false;
    const q=s.question;
    shell(`<div class="sessionTop"><span>${s.score}問 正解</span><span id="sdSeconds" aria-live="off">15秒</span></div><div class="sdTimer" role="progressbar" aria-label="残り時間" aria-valuemin="0" aria-valuemax="15" aria-valuenow="15"><div id="sdTimeFill"></div></div><article class="question"><span class="pill">${html(q.category)}</span><h1 class="statement">${html(q.statement)}</h1><div class="source">${html(q.displaySource.replace(/\s*改題/g,''))}</div></article><div class="answers"><button class="answer" id="sdYes" aria-label="〇">〇</button><button class="answer" id="sdNo" aria-label="✖">✖</button></div><button class="secondary unknown" id="sdUnknown">わからない</button>`);
    el('sdYes').onclick=()=>submit(1);el('sdNo').onclick=()=>submit(0);el('sdUnknown').onclick=()=>submit(-1);
    // Leaving a screen does not pause the server deadline or restore today's attempt.
    tick();timer=setInterval(tick,80);
  }
  function disable(){['sdYes','sdNo','sdUnknown'].forEach(id=>{if(el(id))el(id).disabled=true;});}
  function tick(){
    if(!el('sdTimeFill')){clearInterval(timer);return;}
    const left=Math.max(0,Math.min(15,(endAt-performance.now())/1000));
    el('sdTimeFill').style.width=`${left/15*100}%`;
    el('sdTimeFill').classList.toggle('urgent',left<=5);
    el('sdTimeFill').parentElement.setAttribute('aria-valuenow',String(Math.ceil(left)));
    el('sdSeconds').textContent=`${Math.ceil(left)}秒`;
    if(left<=0&&!locked)syncTimeout();
  }
  async function syncTimeout(){
    locked=true;disable();clearInterval(timer);const token=view;
    try{const s=await rpc('sd_status',{attempt_id:current.id});if(token!==view)return;current=s;if(s.status==='playing'){play(s);}else finish(s);}
    catch(e){if(token===view)connectionFailure(e);}
  }
  async function submit(choice){
    if(locked)return;if(performance.now()>=endAt)return syncTimeout();
    locked=true;disable();const token=view;
    try{const s=await rpc('sd_answer',{attempt_id:current.id,question_index:current.position,choice});if(token!==view)return;current=s;s.status==='playing'?play(s):finish(s);}
    catch(e){if(token===view)connectionFailure(e);}
  }
  function connectionFailure(e){
    clearInterval(timer);disable();error(e);
    const button=document.createElement('button');button.className='secondary listLink';button.textContent='結果を確認する';button.onclick=()=>syncTimeout();el('sdMessage').after(button);
  }
  function finish(s){
    clearInterval(timer);locked=false;current=s;const q=s.lastQuestion;
    shell(`<div class="result"><p>${s.reason==='complete'?'全問正解':s.reason==='timeout'?'時間切れ':s.reason==='unknown'?'わからない':'不正解'}</p><div class="score">${s.score}<span>問</span></div></div>${q&&s.reason!=='complete'?`<details class="questionDetails" open><summary>${html(q.statement)}</summary><div class="listAnswer"><strong>解答 ${q.answer?'〇':'✖'}</strong><p>${html(q.explanation)}</p><div class="source">${html(q.displaySource.replace(/\s*改題/g,''))}</div></div></details>`:''}<p class="note">今日の挑戦は終了しました。</p>${s.published?'<p>記録を登録しました。</p>':`<form id="sdPublish"><label for="sdNickname">ランキングの名前</label><input id="sdNickname" name="nickname" type="text" maxlength="16" autocomplete="off" required value="${html(s.nickname||'')}" ${s.nickname?'readonly':''}><p class="note">${s.nickname?'このアカウントの登録名です。':'1〜16文字。登録後は変更できません。'}</p><button class="primary below" type="submit" id="sdPublishButton">この名前で記録を登録</button><p class="note">登録した名前と最高記録がランキングに公開されます。</p></form>`}<button class="secondary listLink" id="sdBoard">ランキング</button><button class="plain below" id="sdHome">${s.published?'ホーム':'登録せずホームへ'}</button>`);
    el('sdBoard').onclick=board;el('sdHome').onclick=()=>{leave();home();};
    if(el('sdPublish'))el('sdPublish').onsubmit=async e=>{
      e.preventDefault();const token=view;el('sdPublishButton').disabled=true;
      try{const result=await rpc('sd_publish',{attempt_id:s.id,requested_name:el('sdNickname').value.trim()});if(token===view)finish(result);}
      catch(err){if(token===view){error(err);if(el('sdPublishButton'))el('sdPublishButton').disabled=false;}}
    };
  }
  async function board(){
    clearInterval(timer);const token=++view;shell('<h3>ランキング</h3><p>読み込み中…</p>');
    try{const rows=await rpc('sd_leaderboard');if(token!==view)return;
      shell(`<h3>ランキング</h3><p class="note">各アカウントの最高記録</p>${rows.length?`<ol class="sdRanking">${rows.map(row=>`<li><span class="sdPlace">${row.rank}</span><span>${html(row.nickname)}</span><strong>${row.score}<small> 問</small></strong></li>`).join('')}</ol>`:'<p>まだ記録がありません。</p>'}<button class="secondary listLink" id="sdLobby">戻る</button>`);el('sdLobby').onclick=open;
    }catch(e){if(token===view){shell('<h3>ランキング</h3><button class="secondary listLink" id="sdRetryBoard">再読み込み</button>');el('sdRetryBoard').onclick=board;error(e);}}
  }
  async function boot(){
    if(new URL(location.href).searchParams.get('sudden')!=='1')return;
    await open();
    const url=new URL(location.href);url.searchParams.delete('sudden');url.searchParams.delete('code');history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
  document.addEventListener('keydown',e=>{if(e.repeat||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='o'&&el('sdYes'))el('sdYes').click();if(e.key==='x'&&el('sdNo'))el('sdNo').click();});
  return {open,leave,boot};
})();
