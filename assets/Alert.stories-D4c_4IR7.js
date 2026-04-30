import{n as e,o as t}from"./chunk-jRWAZmH_.js";import{k as n,t as r}from"./iframe-Badt6fQx.js";import{a as i,n as a,o,t as s}from"./es-BBjpvi87.js";import{n as c,r as l}from"./motion-Bd5EqQC9.js";import{n as u,t as d}from"./Button-C-bBkApw.js";var f,p,m,h,g,_,v,y,b,x,S,C,w=e((()=>{f=`_alert_1vx2e_2`,p=`_info_1vx2e_14`,m=`_success_1vx2e_19`,h=`_warning_1vx2e_24`,g=`_error_1vx2e_29`,_=`_icon_1vx2e_35`,v=`_body_1vx2e_56`,y=`_title_1vx2e_61`,b=`_description_1vx2e_68`,x=`_actions_1vx2e_80`,S=`_close_1vx2e_87 _focusRing_1wxa1_70`,C={alert:f,info:p,success:m,warning:h,error:g,icon:_,body:v,title:y,description:b,actions:x,close:S}})),T,E,D,O,k=e((()=>{T=t(n(),1),s(),c(),w(),E=r(),D={info:(0,E.jsxs)(`svg`,{viewBox:`0 0 18 18`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,strokeLinejoin:`round`,"aria-hidden":`true`,children:[(0,E.jsx)(`circle`,{cx:`9`,cy:`9`,r:`7.5`}),(0,E.jsx)(`path`,{d:`M9 8v4`}),(0,E.jsx)(`circle`,{cx:`9`,cy:`5.75`,r:`0.25`,fill:`currentColor`,stroke:`none`})]}),success:(0,E.jsxs)(`svg`,{viewBox:`0 0 18 18`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,strokeLinejoin:`round`,"aria-hidden":`true`,children:[(0,E.jsx)(`circle`,{cx:`9`,cy:`9`,r:`7.5`}),(0,E.jsx)(`path`,{d:`M6 9.5l2 2 4-4.5`})]}),warning:(0,E.jsxs)(`svg`,{viewBox:`0 0 18 18`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,strokeLinejoin:`round`,"aria-hidden":`true`,children:[(0,E.jsx)(`path`,{d:`M9 2L1.5 15.5h15z`}),(0,E.jsx)(`path`,{d:`M9 7v3.5`}),(0,E.jsx)(`circle`,{cx:`9`,cy:`13`,r:`0.25`,fill:`currentColor`,stroke:`none`})]}),error:(0,E.jsxs)(`svg`,{viewBox:`0 0 18 18`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,strokeLinejoin:`round`,"aria-hidden":`true`,children:[(0,E.jsx)(`circle`,{cx:`9`,cy:`9`,r:`7.5`}),(0,E.jsx)(`path`,{d:`M6.5 6.5l5 5M11.5 6.5l-5 5`})]})},O=(0,T.forwardRef)(({variant:e=`info`,title:t,children:n,dismissible:r=!1,onDismiss:s,actions:c,className:u=``},d)=>{let[f,p]=(0,T.useState)(!0),m=a();function h(){p(!1),s?.()}let g=e===`error`||e===`warning`?`alert`:`status`;return(0,E.jsx)(o,{children:f&&(0,E.jsxs)(i.div,{ref:d,className:`${C.alert} ${C[e]} ${u}`,role:g,initial:m?void 0:{opacity:0,y:-8},animate:{opacity:1,y:0},exit:m?{opacity:0}:{opacity:0,height:0,marginBottom:0,padding:0,overflow:`hidden`},transition:m?{duration:.1}:l,children:[(0,E.jsx)(`div`,{className:C.icon,children:D[e]}),(0,E.jsxs)(`div`,{className:C.body,children:[t&&(0,E.jsx)(`p`,{className:C.title,children:t}),(0,E.jsx)(`div`,{className:C.description,children:n}),c&&(0,E.jsx)(`div`,{className:C.actions,children:c})]}),r&&(0,E.jsx)(`button`,{type:`button`,className:C.close,onClick:h,"aria-label":`Dismiss`,children:(0,E.jsx)(`svg`,{width:`10`,height:`10`,viewBox:`0 0 10 10`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,"aria-hidden":`true`,children:(0,E.jsx)(`path`,{d:`M1 1l8 8M9 1l-8 8`})})})]})})}),O.displayName=`Alert`,O.__docgenInfo={description:``,methods:[],displayName:`Alert`,props:{variant:{required:!1,tsType:{name:`union`,raw:`"info" | "success" | "warning" | "error"`,elements:[{name:`literal`,value:`"info"`},{name:`literal`,value:`"success"`},{name:`literal`,value:`"warning"`},{name:`literal`,value:`"error"`}]},description:``,defaultValue:{value:`"info"`,computed:!1}},title:{required:!1,tsType:{name:`string`},description:``},children:{required:!0,tsType:{name:`ReactNode`},description:``},dismissible:{required:!1,tsType:{name:`boolean`},description:`Show dismiss button`,defaultValue:{value:`false`,computed:!1}},onDismiss:{required:!1,tsType:{name:`signature`,type:`function`,raw:`() => void`,signature:{arguments:[],return:{name:`void`}}},description:`Called when dismissed`},actions:{required:!1,tsType:{name:`ReactNode`},description:`Action slot rendered below the description`},className:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`""`,computed:!1}}}}})),A,j,M,N,P,F,I,L;e((()=>{k(),u(),A=r(),j={title:`Feedback/Alert`,component:O,tags:[`autodocs`],argTypes:{variant:{control:{type:`select`},options:[`info`,`success`,`warning`,`error`]},dismissible:{control:`boolean`}}},M={args:{variant:`info`,title:`New information`,children:`A new version of Rialto is available. Check out the latest components.`}},N={args:{variant:`success`,title:`Reservation confirmed`,children:`Your table for 4 at The Bistro has been booked for Friday at 7:00 PM.`}},P={args:{variant:`warning`,title:`Unsaved changes`,children:`You have unsaved changes in your profile. Do you want to save them before leaving?`,actions:(0,A.jsxs)(`div`,{style:{display:`flex`,gap:`0.5rem`,marginTop:`0.5rem`},children:[(0,A.jsx)(d,{size:`sm`,children:`Save Changes`}),(0,A.jsx)(d,{size:`sm`,variant:`ghost`,children:`Discard`})]})}},F={args:{variant:`error`,title:`Connection failed`,children:`We could not connect to the database. Please check your internet connection and try again.`}},I={args:{variant:`info`,title:`Dismissible Alert`,children:`You can close this alert by clicking the X button.`,dismissible:!0}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'info',
    title: 'New information',
    children: 'A new version of Rialto is available. Check out the latest components.'
  }
}`,...M.parameters?.docs?.source}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'success',
    title: 'Reservation confirmed',
    children: 'Your table for 4 at The Bistro has been booked for Friday at 7:00 PM.'
  }
}`,...N.parameters?.docs?.source}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'warning',
    title: 'Unsaved changes',
    children: 'You have unsaved changes in your profile. Do you want to save them before leaving?',
    actions: <div style={{
      display: 'flex',
      gap: '0.5rem',
      marginTop: '0.5rem'
    }}>
        <Button size="sm">Save Changes</Button>
        <Button size="sm" variant="ghost">Discard</Button>
      </div>
  }
}`,...P.parameters?.docs?.source}}},F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'error',
    title: 'Connection failed',
    children: 'We could not connect to the database. Please check your internet connection and try again.'
  }
}`,...F.parameters?.docs?.source}}},I.parameters={...I.parameters,docs:{...I.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'info',
    title: 'Dismissible Alert',
    children: 'You can close this alert by clicking the X button.',
    dismissible: true
  }
}`,...I.parameters?.docs?.source}}},L=[`Default`,`Success`,`Warning`,`Error`,`Dismissible`]}))();export{M as Default,I as Dismissible,F as Error,N as Success,P as Warning,L as __namedExportsOrder,j as default};