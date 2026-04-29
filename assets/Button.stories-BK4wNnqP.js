import{n as e,o as t}from"./chunk-jRWAZmH_.js";import{k as n,t as r}from"./iframe-CZhGctaU.js";import{a as i,l as a,n as o,o as s,r as c,t as l}from"./motion-DJCj7Dun.js";import{r as u,t as d}from"./lucide-react-nNnTxa6E.js";var f,p,m,h,g,_,v,y,b,x,S,C=e((()=>{f=`_button_dqsrx_1 _focusRing_1wxa1_70`,p=`_secondary_dqsrx_23 _aluminum_1wxa1_5`,m=`_primary_dqsrx_40`,h=`_ghost_dqsrx_84`,g=`_isLoading_dqsrx_135`,_=`_spinner_dqsrx_140`,v=`_spin_dqsrx_140`,y=`_contentHidden_dqsrx_160`,b=`_sm_dqsrx_165`,x=`_lg_dqsrx_170`,S={button:f,secondary:p,primary:m,ghost:h,isLoading:g,spinner:_,spin:v,contentHidden:y,sm:b,lg:x}})),w,T,E,D=e((()=>{w=t(n(),1),i(),d(),o(),C(),T=r(),E=(0,w.forwardRef)(({variant:e=`secondary`,size:t=`md`,className:n,children:r,disabled:i,isLoading:o,loadingText:d,onClick:f,...p},m)=>{let h=s(),g=t===`md`?``:S[t],_=[S.button,S[e],g,o&&S.isLoading,n].filter(Boolean).join(` `),v=i||o;return(0,T.jsxs)(a.button,{ref:m,className:_,disabled:v,"aria-busy":o||void 0,onClick:f,whileHover:v||h?void 0:{scale:l.scale,transition:l.transition},whileTap:v||h?void 0:`pressed`,variants:{pressed:{scale:.975,y:1}},transition:c,...p,children:[o&&(0,T.jsx)(u,{className:S.spinner,size:t===`sm`?14:18,"aria-hidden":!0}),(0,T.jsx)(`span`,{className:o?S.contentHidden:void 0,children:o&&d?d:r})]})}),E.displayName=`Button`,E.__docgenInfo={description:``,methods:[],displayName:`Button`,props:{variant:{required:!1,tsType:{name:`union`,raw:`"primary" | "secondary" | "ghost"`,elements:[{name:`literal`,value:`"primary"`},{name:`literal`,value:`"secondary"`},{name:`literal`,value:`"ghost"`}]},description:'Visual style: `"primary"` (gold fill), `"secondary"` (aluminum outline), `"ghost"` (no border).',defaultValue:{value:`"secondary"`,computed:!1}},size:{required:!1,tsType:{name:`union`,raw:`"sm" | "md" | "lg"`,elements:[{name:`literal`,value:`"sm"`},{name:`literal`,value:`"md"`},{name:`literal`,value:`"lg"`}]},description:``,defaultValue:{value:`"md"`,computed:!1}},className:{required:!1,tsType:{name:`string`},description:``},children:{required:!1,tsType:{name:`ReactReactNode`,raw:`React.ReactNode`},description:``},isLoading:{required:!1,tsType:{name:`boolean`},description:`When true, shows a spinner and disables the button`},loadingText:{required:!1,tsType:{name:`string`},description:`Optional text to show while loading. If omitted, original children are shown.`}},composes:[`Pick`]}})),O,k,A,j,M,N,P,F;e((()=>{D(),O={title:`Foundation/Button`,component:E,parameters:{layout:`centered`},tags:[`autodocs`],argTypes:{variant:{control:`select`,options:[`primary`,`secondary`,`ghost`]},size:{control:`select`,options:[`sm`,`md`,`lg`]},onClick:{action:`clicked`}}},k={args:{variant:`primary`,children:`Primary Action`}},A={args:{variant:`secondary`,children:`Secondary Action`}},j={args:{variant:`ghost`,children:`Ghost Action`}},M={args:{variant:`primary`,isLoading:!0,loadingText:`Saving...`,children:`Save Changes`}},N={args:{size:`sm`,children:`Small Button`}},P={args:{size:`lg`,children:`Large Button`}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'primary',
    children: 'Primary Action'
  }
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'secondary',
    children: 'Secondary Action'
  }
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'ghost',
    children: 'Ghost Action'
  }
}`,...j.parameters?.docs?.source}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'primary',
    isLoading: true,
    loadingText: 'Saving...',
    children: 'Save Changes'
  }
}`,...M.parameters?.docs?.source}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  args: {
    size: 'sm',
    children: 'Small Button'
  }
}`,...N.parameters?.docs?.source}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  args: {
    size: 'lg',
    children: 'Large Button'
  }
}`,...P.parameters?.docs?.source}}},F=[`Primary`,`Secondary`,`Ghost`,`Loading`,`Small`,`Large`]}))();export{j as Ghost,P as Large,M as Loading,k as Primary,A as Secondary,N as Small,F as __namedExportsOrder,O as default};