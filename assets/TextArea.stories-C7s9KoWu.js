import{n as e,o as t}from"./chunk-jRWAZmH_.js";import{k as n,t as r}from"./iframe-DND2Mrw8.js";import{n as i,t as a}from"./lucide-react-LJeX-BEz.js";import{n as o,t as s}from"./DisabledTooltip--NkBYgjD.js";var c,l,u,d,f,p,m,h,g,_,v,y,b,x,S=e((()=>{c=`_wrapper_1igrs_2`,l=`_label_1igrs_9`,u=`_textarea_1igrs_17 _recessed_1wxa1_60 _focusRing_1wxa1_70`,d=`_textareaContainer_1igrs_53`,f=`_lockIcon_1igrs_57`,p=`_autoResize_1igrs_66`,m=`_error_1igrs_72`,h=`_footer_1igrs_84`,g=`_hint_1igrs_90`,_=`_counter_1igrs_99`,v=`_counterOver_1igrs_107`,y=`_required_1igrs_112`,b=`_optional_1igrs_116`,x={wrapper:c,label:l,textarea:u,textareaContainer:d,lockIcon:f,autoResize:p,error:m,footer:h,hint:g,counter:_,counterOver:v,required:y,optional:b}})),C,w,T,E=e((()=>{C=t(n(),1),a(),o(),S(),w=r(),T=(0,C.forwardRef)(({label:e,hint:t,error:n=!1,autoResize:r=!1,maxLength:a,disabledReason:o,showOptional:c,className:l=``,rows:u=3,value:d,onChange:f,disabled:p,readOnly:m,required:h,...g},_)=>{let v=(0,C.useId)(),y=(0,C.useRef)(null),[b,S]=(0,C.useState)(0),T=(0,C.useCallback)(()=>{let e=y.current;!e||!r||(e.style.height=`auto`,e.style.height=`${e.scrollHeight}px`)},[r]),E=(0,C.useCallback)(e=>{f?.(e),S(e.target.value.length),T()},[f,T]),D=typeof d==`string`?d.length:b,O=a!=null&&D>a;return(0,w.jsx)(s,{disabled:p,disabledReason:o,children:(0,w.jsxs)(`div`,{ref:_,className:`${x.wrapper} ${n?x.error:``} ${l}`,children:[e&&(0,w.jsxs)(`label`,{htmlFor:v,className:x.label,children:[e,h&&(0,w.jsx)(`span`,{className:x.required,children:` *`}),c&&!h&&(0,w.jsx)(`span`,{className:x.optional,children:` (optional)`})]}),(0,w.jsxs)(`div`,{className:x.textareaContainer,children:[(0,w.jsx)(`textarea`,{ref:y,id:v,className:`${x.textarea} ${r?x.autoResize:``}`,rows:u,value:d,onChange:E,disabled:p,"aria-describedby":t?`${v}-hint`:void 0,readOnly:m,...g}),p&&o&&(0,w.jsx)(i,{size:12,"aria-hidden":!0,className:x.lockIcon})]}),(t||a!=null)&&(0,w.jsxs)(`div`,{className:x.footer,children:[t&&(0,w.jsx)(`span`,{id:`${v}-hint`,className:x.hint,children:t}),a!=null&&(0,w.jsxs)(`span`,{className:`${x.counter} ${O?x.counterOver:``}`,children:[D,`/`,a]})]})]})})}),T.displayName=`TextArea`,T.__docgenInfo={description:``,methods:[],displayName:`TextArea`,props:{label:{required:!1,tsType:{name:`string`},description:``},hint:{required:!1,tsType:{name:`string`},description:``},error:{required:!1,tsType:{name:`boolean`},description:`When true, applies error styling to the wrapper`,defaultValue:{value:`false`,computed:!1}},autoResize:{required:!1,tsType:{name:`boolean`},description:`Auto-resize to fit content`,defaultValue:{value:`false`,computed:!1}},maxLength:{required:!1,tsType:{name:`number`},description:`Max character count (shows counter)`},disabledReason:{required:!1,tsType:{name:`string`},description:"Explains why the textarea is disabled. Shown in a tooltip; requires `disabled` to be true."},showOptional:{required:!1,tsType:{name:`boolean`},description:`When true and not required, shows "(optional)" after the label`},className:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`""`,computed:!1}},rows:{defaultValue:{value:`3`,computed:!1},required:!1}},composes:[`Omit`]}})),D,O,k,A,j,M,N;e((()=>{E(),D={title:`Form/TextArea`,component:T,tags:[`autodocs`],argTypes:{error:{control:`boolean`},autoResize:{control:`boolean`},disabled:{control:`boolean`},required:{control:`boolean`}}},O={args:{label:`Description`,placeholder:`Enter details...`}},k={args:{label:`Bio`,hint:`Tell us a bit about yourself.`,placeholder:`I am a software engineer...`}},A={args:{label:`Comment`,maxLength:100,placeholder:`Keep it short...`}},j={args:{label:`Feedback`,error:!0,hint:`This field is required.`,value:``}},M={args:{label:`Long Note`,autoResize:!0,placeholder:`Type a lot of text and see it grow...`,rows:1}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Description',
    placeholder: 'Enter details...'
  }
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Bio',
    hint: 'Tell us a bit about yourself.',
    placeholder: 'I am a software engineer...'
  }
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Comment',
    maxLength: 100,
    placeholder: 'Keep it short...'
  }
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Feedback',
    error: true,
    hint: 'This field is required.',
    value: ''
  }
}`,...j.parameters?.docs?.source}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Long Note',
    autoResize: true,
    placeholder: 'Type a lot of text and see it grow...',
    rows: 1
  }
}`,...M.parameters?.docs?.source}}},N=[`Default`,`WithHint`,`WithCharacterCounter`,`ErrorState`,`AutoResize`]}))();export{M as AutoResize,O as Default,j as ErrorState,A as WithCharacterCounter,k as WithHint,N as __namedExportsOrder,D as default};