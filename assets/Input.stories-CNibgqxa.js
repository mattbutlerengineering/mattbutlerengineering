import{n as e,o as t}from"./chunk-jRWAZmH_.js";import{k as n,t as r}from"./iframe-DND2Mrw8.js";import{n as i,t as a}from"./lucide-react-LJeX-BEz.js";import{n as o,t as s}from"./DisabledTooltip--NkBYgjD.js";var c,l,u,d,f,p,m,h,g,_,v,y,b,x,S=e((()=>{c=`_wrapper_h9dud_1`,l=`_label_h9dud_7`,u=`_input_h9dud_14 _recessed_1wxa1_60 _focusRing_1wxa1_70`,d=`_inputContainer_h9dud_47`,f=`_startIcon_h9dud_52`,p=`_endIcon_h9dud_53`,m=`_inputWithStartIcon_h9dud_72`,h=`_inputWithEndIcon_h9dud_76`,g=`_lockIcon_h9dud_80`,_=`_error_h9dud_90`,v=`_hint_h9dud_101`,y=`_required_h9dud_111`,b=`_optional_h9dud_115`,x={wrapper:c,label:l,input:u,inputContainer:d,startIcon:f,endIcon:p,inputWithStartIcon:m,inputWithEndIcon:h,lockIcon:g,error:_,hint:v,required:y,optional:b}})),C,w,T,E=e((()=>{C=t(n(),1),a(),o(),S(),w=r(),T=(0,C.forwardRef)(({label:e,hint:t,error:n,disabled:r,disabledReason:a,startIcon:o,endIcon:c,showOptional:l,className:u,id:d,readOnly:f,required:p,...m},h)=>{let g=(0,C.useId)(),_=d??g,v=[x.wrapper,n&&x.error,u].filter(Boolean).join(` `),y=[x.input,o&&x.inputWithStartIcon,c&&x.inputWithEndIcon].filter(Boolean).join(` `);return(0,w.jsx)(s,{disabled:r,disabledReason:a,children:(0,w.jsxs)(`div`,{className:v,children:[e&&(0,w.jsxs)(`label`,{htmlFor:_,className:x.label,children:[e,p&&(0,w.jsx)(`span`,{className:x.required,"aria-hidden":`true`,children:` *`}),l&&!p&&(0,w.jsx)(`span`,{className:x.optional,children:` (optional)`})]}),(0,w.jsxs)(`div`,{className:x.inputContainer,children:[o&&(0,w.jsx)(`span`,{className:x.startIcon,"aria-hidden":`true`,children:o}),(0,w.jsx)(`input`,{ref:h,id:_,className:y,disabled:r||void 0,"aria-invalid":n||void 0,"aria-describedby":t?`${_}-hint`:void 0,required:p,readOnly:f,...m}),c&&(0,w.jsx)(`span`,{className:x.endIcon,"aria-hidden":`true`,children:c}),r&&a&&(0,w.jsx)(i,{size:12,"aria-hidden":!0,className:x.lockIcon})]}),t&&(0,w.jsx)(`span`,{id:`${_}-hint`,className:x.hint,children:t})]})})}),T.displayName=`Input`,T.__docgenInfo={description:``,methods:[],displayName:`Input`,props:{label:{required:!1,tsType:{name:`string`},description:``},hint:{required:!1,tsType:{name:`string`},description:`Helper text rendered below the input`},error:{required:!1,tsType:{name:`boolean`},description:"When true, applies error styling and sets `aria-invalid`"},disabledReason:{required:!1,tsType:{name:`string`},description:"Explains why the input is disabled. Shown in a tooltip; requires `disabled` to be true."},startIcon:{required:!1,tsType:{name:`ReactNode`},description:`Icon rendered at the inline-start of the input`},endIcon:{required:!1,tsType:{name:`ReactNode`},description:`Icon rendered at the inline-end of the input`},showOptional:{required:!1,tsType:{name:`boolean`},description:`When true and not required, shows "(optional)" after the label`}},composes:[`Omit`]}})),D,O,k,A,j,M;e((()=>{E(),D={title:`Form/Input`,component:T,parameters:{layout:`centered`},tags:[`autodocs`],argTypes:{onChange:{action:`changed`}}},O={args:{placeholder:`Enter text...`,style:{width:`300px`}}},k={args:{label:`Email Address`,placeholder:`email@example.com`,type:`email`,style:{width:`300px`}}},A={args:{label:`Username`,defaultValue:`invalid user`,error:!0,style:{width:`300px`}}},j={args:{label:`Locked Field`,value:`Read-only value`,disabled:!0,style:{width:`300px`}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    placeholder: 'Enter text...',
    style: {
      width: '300px'
    }
  }
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Email Address',
    placeholder: 'email@example.com',
    type: 'email',
    style: {
      width: '300px'
    }
  }
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Username',
    defaultValue: 'invalid user',
    error: true,
    style: {
      width: '300px'
    }
  }
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Locked Field',
    value: 'Read-only value',
    disabled: true,
    style: {
      width: '300px'
    }
  }
}`,...j.parameters?.docs?.source}}},M=[`Default`,`WithLabel`,`Error`,`Disabled`]}))();export{O as Default,j as Disabled,A as Error,k as WithLabel,M as __namedExportsOrder,D as default};