import { isIP } from "node:net";
import { WEB_CSS, WEB_JS, SETUP_TEMPLATE } from "./web-assets.js";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const SETUP_JS = String.raw`
(function(){
  var $=function(id){return document.getElementById(id)}, generation=0, key='', accounts=[];
  function t(zh,en){return document.documentElement.lang==='zh-CN'?zh:en}
  function say(id,zh,en,bad){$(id).textContent=t(zh,en);$(id).className='pw-feedback'+(bad?' error':'')}
  function forget(){generation++;key='';accounts=[];try{sessionStorage.removeItem('publy_hosted_api_key')}catch(_){}$('api-key').value='';$('app-secret').value='';$('app-id').value='';$('account-name').value='';$('account-list').textContent='';$('bind-state').textContent='';$('bind-button').disabled=true; say('session-state','已清除此标签页凭据。已复制或保存到其他位置的 Key 不受影响；需要撤销请联系运营者。','Credentials cleared from this tab. Copies saved elsewhere are unchanged.');}
  try{sessionStorage.removeItem('publy_hosted_api_key')}catch(_){}
  $('server-url').textContent=location.origin;
  $('forget').addEventListener('click',forget);
  $('api-key').addEventListener('input',function(){generation++;key='';$('bind-button').disabled=true;$('account-list').textContent='';$('session-state').textContent='';$('app-secret').value='';});
  $('copy-ip').disabled=$('egress-ip').dataset.available!=='true';
  $('copy-ip').addEventListener('click',async function(){try{await navigator.clipboard.writeText($('egress-ip').textContent);say('session-state','服务器 IP 已复制。请在微信 API IP 白名单中新建一行粘贴。','Server IP copied. Paste it on a new line in the WeChat API IP whitelist.')}catch(_){say('session-state','无法自动复制，请选中服务器 IP 手动复制。','Select the server IP and copy it manually.',true)}});
  function showAccounts(){ $('account-list').textContent=accounts.length?t('已连接：','Connected: ')+accounts.map(function(a){return a.name}).join(' / '):t('还没有连接公众号。请继续第 2、3 步。','No account connected yet. Continue with steps 2 and 3.');$('bind-button').disabled=accounts.length>0; }
  $('restore').addEventListener('submit',async function(e){
    e.preventDefault();var current=++generation,candidate=$('api-key').value.trim(); key='';$('bind-button').disabled=true;$('restore-button').disabled=true;$('account-list').textContent='';
    say('session-state','正在检查账户…','Checking your account…');
    try{var res=await fetch('/v1/accounts',{headers:{'x-api-key':candidate},cache:'no-store'});var value=await res.json();if(current!==generation)return;if(!res.ok)throw new Error('auth');
      key=candidate;accounts=value.accounts||[];showAccounts();say('session-state','账户已识别。此检查不会付款，也不会创建草稿。','Account recognized. This check does not pay or create a draft.');
    }catch(_){if(current===generation)say('session-state','无法确认账户。请检查 Key、网络与服务器地址；不要另建账户来恢复已购权益。','Could not verify the account. Check your key, network and server address; do not create a different account to recover paid access.',true)}
    finally{$('restore-button').disabled=false;}
  });
  $('bind').addEventListener('submit',async function(e){
    e.preventDefault();if(!key||accounts.length)return;var current=generation,boundKey=key; $('bind-button').disabled=true;
    var body={accountName:$('account-name').value.trim(),appId:$('app-id').value.trim(),appSecret:$('app-secret').value.trim()};
    say('bind-state','正在从此服务器检查公众号凭据…','Checking WeChat credentials from this server…');
    try{var res=await fetch('/v1/bind',{method:'POST',headers:{'content-type':'application/json','x-api-key':boundKey},body:JSON.stringify(body)});var value=await res.json();if(current!==generation||key!==boundKey)return;
      if(!res.ok){
        var messages={NEEDS_WHITELIST:['请将微信实际报告的出口 IP 加入 API IP 白名单：','Add the egress IP reported by WeChat to its API IP whitelist: '],ACCOUNT_LIMIT:['此账户已达到公众号数量上限，请刷新账户列表或联系运营者。','The account limit was reached. Refresh the account list or contact the operator.'],ACCOUNT_NAME_TAKEN:['此昵称已被使用，请换一个昵称。','This nickname is already used. Choose another.'],RATE_LIMITED:['尝试过多，请一小时后再试；不要反复点击。','Too many attempts. Wait one hour before trying again.']};
        var m=messages[value.code];if(m){var reported=value.code==='NEEDS_WHITELIST'&&typeof value.ip==='string'?value.ip:'';say('bind-state',m[0]+reported,m[1]+reported,true)}else say('bind-state','未能连接。请核对 AppID 与 AppSecret 是否属于同一公众号、IP 白名单、网络及账号权限。输入已保留；不要重置密钥或重复购买。','Connection not confirmed. Check the matching AppID/AppSecret, IP whitelist, network and account permissions. Inputs are retained; do not reset keys or purchase again.',true);return;
      }
      $('app-secret').value='';$('app-id').value='';accounts=[{name:value.accountName}];showAccounts();
      say('bind-state','已连接：'+value.accountName+'。凭据与出口 IP 校验成功；仍须在微信后台确认草稿接口权限，然后配置 Obsidian。','Connected: '+value.accountName+'. Credentials and IP validated; confirm draft API permission in WeChat before configuring Obsidian.');
    }catch(_){if(current===generation)say('bind-state','连接结果未确认。先点击“查看我的账户”核对是否已连接，避免重复绑定；不要重复购买。','Connection outcome unknown. Check your account list before binding again; do not purchase again.',true)}
    finally{if(current===generation)$('bind-button').disabled=!key||accounts.length>0;}
  });
})();`;

/** Public shell only. Account data stays behind normal user-key authentication. */
export function setupPage(publicIp?: string): string {
  const ip = publicIp && isIP(publicIp) ? publicIp : null;
  return SETUP_TEMPLATE.replace('__WEB_CSS__', () => WEB_CSS).replace('__WEB_JS__', () => WEB_JS)
    .replace('<strong id="egress-ip">__PUBLIC_IP__</strong>', () => `<strong id="egress-ip" data-available="${Boolean(ip)}">${ip ? escapeHtml(ip) : 'IP 未确认 / IP unavailable — contact the operator'}</strong>`)
    .replace('__SETUP_JS__', () => SETUP_JS);
}
