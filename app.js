"use strict";

const FIELD_SCHEMAS = {
  url: [{id:"url",label:"웹사이트 주소",type:"url",placeholder:"https://example.com",required:true,help:"http:// 또는 https://로 시작하는 주소를 입력하세요."}],
  vcard: [
    {id:"lastName",label:"성",placeholder:"홍"},{id:"firstName",label:"이름",placeholder:"길동",required:true},
    {id:"company",label:"회사명",placeholder:"회사 또는 브랜드"},{id:"jobTitle",label:"직함",placeholder:"담당자"},
    {id:"mobile",label:"휴대폰",type:"tel",placeholder:"010-1234-5678"},{id:"email",label:"이메일",type:"email",placeholder:"name@example.com"},
    {id:"website",label:"웹사이트",type:"url",placeholder:"https://example.com"},{id:"address",label:"주소",placeholder:"서울특별시 ..."}
  ],
  text: [{id:"text",label:"전달할 내용",type:"textarea",placeholder:"QR 코드에 담을 문장을 입력하세요.",required:true,maxlength:900}],
  email: [{id:"emailTo",label:"받는 사람",type:"email",placeholder:"name@example.com",required:true},{id:"emailSubject",label:"제목",placeholder:"문의드립니다"},{id:"emailBody",label:"본문",type:"textarea",placeholder:"메일 앱에 미리 입력할 내용"}],
  sms: [{id:"smsPhone",label:"받는 사람 번호",type:"tel",placeholder:"010-1234-5678",required:true},{id:"smsBody",label:"문자 내용",type:"textarea",placeholder:"미리 입력할 문자 내용"}],
  wifi: [{id:"wifiSsid",label:"Wi-Fi 이름(SSID)",placeholder:"네트워크 이름",required:true},{id:"wifiPassword",label:"비밀번호",type:"password",placeholder:"Wi-Fi 비밀번호"},{id:"wifiEncryption",label:"암호화 방식",type:"select",options:[["WPA","WPA/WPA2/WPA3"],["WEP","WEP"],["nopass","암호 없음"]]},{id:"wifiHidden",label:"숨겨진 네트워크",type:"checkbox"}],
  kakao: [{id:"kakaoUrl",label:"카카오톡 오픈채팅 주소",type:"url",placeholder:"https://open.kakao.com/o/...",required:true}],
  whatsapp: [{id:"waPhone",label:"국가번호 포함 전화번호",type:"tel",placeholder:"821012345678",required:true},{id:"waText",label:"미리 입력할 메시지",placeholder:"안녕하세요. 문의드립니다."}],
  youtube: [{id:"youtubeUrl",label:"YouTube 영상 또는 채널 주소",type:"url",placeholder:"https://www.youtube.com/...",required:true}],
  geo: [{id:"latitude",label:"위도",type:"number",step:"any",placeholder:"37.5665",required:true},{id:"longitude",label:"경도",type:"number",step:"any",placeholder:"126.9780",required:true}],
  event: [{id:"eventTitle",label:"일정 제목",placeholder:"미팅",required:true},{id:"eventStart",label:"시작 일시",type:"datetime-local",required:true},{id:"eventEnd",label:"종료 일시",type:"datetime-local",required:true},{id:"eventLocation",label:"장소",placeholder:"회의실 또는 주소"},{id:"eventDescription",label:"설명",type:"textarea",placeholder:"일정에 함께 저장할 내용"}],
  crypto: [{id:"cryptoType",label:"화폐 종류",type:"select",options:[["bitcoin","Bitcoin"],["ethereum","Ethereum"]]},{id:"cryptoAddress",label:"지갑 주소",placeholder:"주소를 정확히 입력하세요",required:true},{id:"cryptoAmount",label:"수량(선택)",type:"number",step:"any",placeholder:"0.001"}]
};

const SAMPLE_DATA = {
  url:{url:"https://github.com/"},vcard:{lastName:"홍",firstName:"길동",company:"QR Card Studio",jobTitle:"담당자",mobile:"010-1234-5678",email:"hello@example.com",website:"https://example.com",address:"서울특별시"},
  text:{text:"QR Card Studio에서 만든 예시 QR 코드입니다."},email:{emailTo:"hello@example.com",emailSubject:"QR 코드 문의",emailBody:"안녕하세요. QR 코드를 보고 문의드립니다."},
  sms:{smsPhone:"010-1234-5678",smsBody:"QR 코드를 보고 연락드립니다."},wifi:{wifiSsid:"Guest WiFi",wifiPassword:"sample1234",wifiEncryption:"WPA"},
  kakao:{kakaoUrl:"https://open.kakao.com/"},whatsapp:{waPhone:"821012345678",waText:"안녕하세요. 문의드립니다."},youtube:{youtubeUrl:"https://www.youtube.com/"},
  geo:{latitude:"37.5665",longitude:"126.9780"},event:{eventTitle:"예시 미팅",eventStart:"2026-07-21T10:00",eventEnd:"2026-07-21T11:00",eventLocation:"회의실",eventDescription:"QR Card Studio 예시 일정"},
  crypto:{cryptoType:"bitcoin",cryptoAddress:"예시 주소를 실제 지갑 주소로 바꿔 주세요",cryptoAmount:""}
};

const state={type:"url",logo:null,svg:"",data:"",toastTimer:0};
const $=id=>document.getElementById(id);
const ui={tabs:$('typeTabs'),fields:$('dynamicFields'),message:$('fieldMessage'),output:$('qrOutput'),empty:$('emptyState'),status:$('statusBadge'),png:$('downloadPng'),svg:$('downloadSvg'),copy:$('copyData'),pattern:$('patternStyle'),frame:$('frameStyle'),frameText:$('frameText'),frameTextField:$('frameTextField'),fg:$('fgColor'),bg:$('bgColor'),logo:$('logoUpload'),logoName:$('logoName'),clearLogo:$('clearLogo'),toast:$('toast')};

function escapeXml(value){return String(value).replace(/[<>&"']/g,char=>({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&apos;"})[char]);}
function escapePayload(value){return String(value||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,");}
function fieldValue(id){const input=$(id);return input?.type==="checkbox"?input.checked:(input?.value.trim()||"");}
function encoded(value){return encodeURIComponent(value||"").replace(/%20/g,"%20");}
function compactObject(object){return Object.fromEntries(Object.entries(object).filter(([,value])=>value!==""&&value!==false));}

function renderFields(){
  ui.fields.replaceChildren();
  for(const spec of FIELD_SCHEMAS[state.type]){
    const wrapper=document.createElement("div");wrapper.className=`field${spec.type==="textarea"?" span-2":""}`;
    const label=document.createElement("label");label.htmlFor=spec.id;label.textContent=spec.label+(spec.required?" *":"");wrapper.append(label);
    let input;
    if(spec.type==="textarea") input=document.createElement("textarea");
    else if(spec.type==="select"){
      input=document.createElement("select");
      for(const [value,text] of spec.options){const option=document.createElement("option");option.value=value;option.textContent=text;input.append(option);}
    }else if(spec.type==="checkbox"){
      wrapper.className="field span-2 checkbox-field";label.remove();input=document.createElement("input");input.type="checkbox";input.id=spec.id;const inline=document.createElement("label");inline.htmlFor=spec.id;inline.append(input,document.createTextNode(` ${spec.label}`));wrapper.append(inline);ui.fields.append(wrapper);continue;
    }else input=document.createElement("input");
    input.id=spec.id;input.name=spec.id;input.type=spec.type||"text";if(spec.placeholder)input.placeholder=spec.placeholder;if(spec.required)input.required=true;if(spec.maxlength)input.maxLength=spec.maxlength;if(spec.step)input.step=spec.step;
    wrapper.append(input);
    if(spec.help){const help=document.createElement("small");help.className="help";help.textContent=spec.help;wrapper.append(help);}
    ui.fields.append(wrapper);
  }
  ui.message.textContent="";generate(true);ui.fields.querySelector("input,textarea,select")?.focus();
}

function validate(){
  const required=FIELD_SCHEMAS[state.type].filter(field=>field.required);
  for(const spec of required){const input=$(spec.id);if(!fieldValue(spec.id)){input?.setAttribute("aria-invalid","true");return `${spec.label} 항목을 입력해 주세요.`;}input?.removeAttribute("aria-invalid");}
  for(const spec of FIELD_SCHEMAS[state.type]){
    const input=$(spec.id);if(!input||!input.value)continue;
    if(spec.type==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)){input.setAttribute("aria-invalid","true");return "이메일 주소 형식을 확인해 주세요.";}
    if(spec.type==="url"&&!/^https?:\/\/\S+$/i.test(input.value)){input.setAttribute("aria-invalid","true");return "주소는 http:// 또는 https://로 시작해 주세요.";}
    input.removeAttribute("aria-invalid");
  }
  if(state.type==="event"&&fieldValue("eventEnd")<=fieldValue("eventStart"))return "종료 일시는 시작 일시보다 뒤여야 합니다.";
  if(state.type==="geo"&&(Math.abs(Number(fieldValue("latitude")))>90||Math.abs(Number(fieldValue("longitude")))>180))return "위도는 ±90, 경도는 ±180 범위로 입력해 주세요.";
  return "";
}

function getPayload(){
  const v=fieldValue,t=state.type;
  if(t==="url")return v("url");
  if(t==="text")return v("text");
  if(t==="vcard")return ["BEGIN:VCARD","VERSION:3.0",`N:${escapePayload(v("lastName"))};${escapePayload(v("firstName"))};;;`,`FN:${escapePayload(`${v("lastName")} ${v("firstName")}`.trim())}`,`ORG:${escapePayload(v("company"))}`,`TITLE:${escapePayload(v("jobTitle"))}`,`TEL;TYPE=CELL:${escapePayload(v("mobile"))}`,`EMAIL:${escapePayload(v("email"))}`,`URL:${escapePayload(v("website"))}`,`ADR:;;${escapePayload(v("address"))};;;;`,"END:VCARD"].filter(line=>!line.endsWith(":" )&&!line.match(/^(ORG|TITLE|TEL;TYPE=CELL|EMAIL|URL|ADR):?;*$/)).join("\r\n");
  if(t==="email")return `mailto:${v("emailTo")}?subject=${encoded(v("emailSubject"))}&body=${encoded(v("emailBody"))}`;
  if(t==="sms")return `SMSTO:${v("smsPhone")}:${v("smsBody")}`;
  if(t==="wifi")return `WIFI:T:${v("wifiEncryption")};S:${escapePayload(v("wifiSsid"))};P:${escapePayload(v("wifiPassword"))};H:${v("wifiHidden")?"true":"false"};;`;
  if(t==="kakao")return v("kakaoUrl");
  if(t==="whatsapp")return `https://wa.me/${v("waPhone").replace(/\D/g,"")}${v("waText")?`?text=${encoded(v("waText"))}`:""}`;
  if(t==="youtube")return v("youtubeUrl");
  if(t==="geo")return `geo:${v("latitude")},${v("longitude")}`;
  if(t==="event")return ["BEGIN:VCALENDAR","VERSION:2.0","BEGIN:VEVENT",`SUMMARY:${escapePayload(v("eventTitle"))}`,`DTSTART:${toIcal(v("eventStart"))}`,`DTEND:${toIcal(v("eventEnd"))}`,`LOCATION:${escapePayload(v("eventLocation"))}`,`DESCRIPTION:${escapePayload(v("eventDescription"))}`,"END:VEVENT","END:VCALENDAR"].filter(line=>!line.endsWith(":" )).join("\r\n");
  if(t==="crypto")return `${v("cryptoType")}:${v("cryptoAddress")}${v("cryptoAmount")?`?amount=${v("cryptoAmount")}`:""}`;
  return "";
}

function toIcal(value){return value.replace(/[-:]/g,"").replace("T", "T")+"00";}
function setReady(ready){ui.empty.hidden=ready;ui.output.hidden=!ready;ui.status.textContent=ready?"생성 완료":"입력 대기";ui.status.classList.toggle("ready",ready);[ui.png,ui.svg,ui.copy].forEach(button=>button.disabled=!ready);}

function generate(silent=false){
  const error=validate();ui.message.textContent=silent&&error?"":error;
  if(error||typeof window.qrcode!=="function"){state.svg="";state.data="";setReady(false);if(typeof window.qrcode!=="function")ui.message.textContent="QR 생성 라이브러리를 불러오지 못했습니다. 인터넷 연결 후 새로고침해 주세요.";return;}
  try{state.data=getPayload();const qr=window.qrcode(0,state.logo?"H":"M");qr.addData(unescape(encodeURIComponent(state.data)),"Byte");qr.make();state.svg=renderSvg(qr);ui.output.innerHTML=state.svg;setReady(true);}catch(error){state.svg="";setReady(false);ui.message.textContent="내용이 너무 길어 QR 코드를 만들 수 없습니다. 입력 내용을 줄여 주세요.";}
}

function renderSvg(qr){
  const count=qr.getModuleCount(),cell=8,quiet=cell*4,qrSize=count*cell,frame=ui.frame.value,label=escapeXml(ui.frameText.value||"SCAN TO CONNECT"),fg=ui.fg.value,bg=ui.bg.value;
  const extraTop=frame==="label"?54:frame==="card"?38:0,extraBottom=frame==="label"?18:frame==="card"?60:0,width=qrSize+quiet*2+(frame==="card"?28:0),height=qrSize+quiet*2+extraTop+extraBottom;
  const offsetX=(width-qrSize)/2,offsetY=quiet+extraTop,shape=ui.pattern.value;
  let modules="";
  for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col)){
    const finder=(row<7&&col<7)||(row<7&&col>=count-7)||(row>=count-7&&col<7);if(finder)continue;
    const x=offsetX+col*cell,y=offsetY+row*cell;
    modules+=shape==="dot"?`<circle cx="${x+cell/2}" cy="${y+cell/2}" r="${cell*.43}"/>`:`<rect x="${x}" y="${y}" width="${cell}" height="${cell}"${shape==="rounded"?` rx="${cell*.32}"`:""}/>`;
  }
  const eye=(col,row)=>{const x=offsetX+col*cell,y=offsetY+row*cell;return `<rect x="${x}" y="${y}" width="${cell*7}" height="${cell*7}" rx="${shape==="square"?0:cell}"/><rect x="${x+cell}" y="${y+cell}" width="${cell*5}" height="${cell*5}" rx="${shape==="square"?0:cell*.6}" fill="${bg}"/><rect x="${x+cell*2}" y="${y+cell*2}" width="${cell*3}" height="${cell*3}" rx="${shape==="square"?0:cell*.5}"/>`;};
  let logo="";if(state.logo){const size=qrSize*.19,x=(width-size)/2,y=offsetY+(qrSize-size)/2;logo=`<rect x="${x-cell}" y="${y-cell}" width="${size+cell*2}" height="${size+cell*2}" rx="${cell}" fill="${bg}"/><image href="${escapeXml(state.logo)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;}
  const frameMarkup=frame==="label"?`<rect x="8" y="8" width="${width-16}" height="${height-16}" rx="20" fill="none" stroke="${fg}" stroke-width="4"/><text x="${width/2}" y="39" text-anchor="middle" fill="${fg}" font-family="Arial,sans-serif" font-size="18" font-weight="700">${label}</text>`:frame==="card"?`<rect x="1" y="1" width="${width-2}" height="${height-2}" rx="22" fill="${bg}" stroke="${fg}" stroke-width="2"/><text x="${width/2}" y="${height-26}" text-anchor="middle" fill="${fg}" font-family="Arial,sans-serif" font-size="15" font-weight="700">${label}</text>`:"";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="생성된 QR 코드"><rect width="${width}" height="${height}" rx="${frame==="none"?12:0}" fill="${bg}"/>${frameMarkup}<g fill="${fg}">${modules}${eye(0,0)}${eye(count-7,0)}${eye(0,count-7)}</g>${logo}</svg>`;
}

function fillSample(){for(const [id,value] of Object.entries(SAMPLE_DATA[state.type])){const input=$(id);if(!input)continue;if(input.type==="checkbox")input.checked=Boolean(value);else input.value=value;}generate();showToast("예시 정보를 채웠습니다.");}
function resetAll(){state.logo=null;ui.logo.value="";ui.logoName.textContent="선택된 이미지 없음";ui.clearLogo.hidden=true;ui.pattern.value="square";ui.frame.value="none";ui.fg.value="#172554";ui.bg.value="#ffffff";ui.frameText.value="SCAN TO CONNECT";renderFields();syncDesignControls();showToast("입력과 디자인을 초기화했습니다.");}
function syncDesignControls(){ui.frameTextField.hidden=ui.frame.value==="none";document.querySelectorAll("output[for]").forEach(output=>output.textContent=$(output.getAttribute("for")).value.toUpperCase());}
function showToast(message){clearTimeout(state.toastTimer);ui.toast.textContent=message;ui.toast.classList.add("show");state.toastTimer=setTimeout(()=>ui.toast.classList.remove("show"),2200);}
function downloadSvg(){downloadBlob(new Blob([state.svg],{type:"image/svg+xml;charset=utf-8"}),`qr-${state.type}.svg`);showToast("SVG 파일을 저장했습니다.");}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadPng(){const blob=new Blob([state.svg],{type:"image/svg+xml;charset=utf-8"}),url=URL.createObjectURL(blob),image=new Image();image.onload=()=>{const canvas=document.createElement("canvas"),scale=3;canvas.width=image.width*scale;canvas.height=image.height*scale;const context=canvas.getContext("2d");context.imageSmoothingEnabled=false;context.drawImage(image,0,0,canvas.width,canvas.height);canvas.toBlob(png=>{if(png)downloadBlob(png,`qr-${state.type}.png`);URL.revokeObjectURL(url);showToast("고해상도 PNG 파일을 저장했습니다.");},"image/png");};image.onerror=()=>{URL.revokeObjectURL(url);showToast("PNG 변환에 실패했습니다.");};const doc=new DOMParser().parseFromString(state.svg,"image/svg+xml"),viewBox=doc.documentElement.viewBox.baseVal;image.width=viewBox.width;image.height=viewBox.height;image.src=url;}
async function copyData(){try{await navigator.clipboard.writeText(state.data);showToast("QR에 담긴 내용을 복사했습니다.");}catch{showToast("복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");}}
function handleLogo(){const file=ui.logo.files[0];if(!file)return;if(file.size>1024*1024){ui.logo.value="";showToast("1MB 이하 이미지를 선택해 주세요.");return;}const reader=new FileReader();reader.onload=()=>{state.logo=reader.result;ui.logoName.textContent=file.name;ui.clearLogo.hidden=false;generate();};reader.readAsDataURL(file);}
function toggleTheme(){const root=document.documentElement,dark=root.dataset.theme!=="dark";root.dataset.theme=dark?"dark":"";localStorage.setItem("qr-theme",dark?"dark":"light");$('themeToggle').setAttribute("aria-label",dark?"밝은 화면으로 전환":"어두운 화면으로 전환");}

ui.tabs.addEventListener("click",event=>{const tab=event.target.closest("[data-type]");if(!tab)return;state.type=tab.dataset.type;ui.tabs.querySelectorAll("[role=tab]").forEach(button=>{const active=button===tab;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active));});renderFields();});
ui.tabs.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight"].includes(event.key))return;const tabs=[...ui.tabs.querySelectorAll("[role=tab]")],index=tabs.indexOf(document.activeElement),next=(index+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click();});
$('qrForm').addEventListener("input",generate);document.querySelectorAll("#patternStyle,#frameStyle,#frameText,#fgColor,#bgColor").forEach(control=>control.addEventListener("input",()=>{syncDesignControls();generate();}));
$('fillSample').addEventListener("click",fillSample);$('resetAll').addEventListener("click",resetAll);$('chooseLogo').addEventListener("click",()=>ui.logo.click());ui.logo.addEventListener("change",handleLogo);ui.clearLogo.addEventListener("click",()=>{state.logo=null;ui.logo.value="";ui.logoName.textContent="선택된 이미지 없음";ui.clearLogo.hidden=true;generate();});ui.png.addEventListener("click",downloadPng);ui.svg.addEventListener("click",downloadSvg);ui.copy.addEventListener("click",copyData);$('themeToggle').addEventListener("click",toggleTheme);
if(localStorage.getItem("qr-theme")==="dark"||(!localStorage.getItem("qr-theme")&&matchMedia("(prefers-color-scheme: dark)").matches))toggleTheme();
window.addEventListener("load",renderFields);
