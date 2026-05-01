import{n as e,o as t}from"./chunk-jRWAZmH_.js";import{k as n,t as r}from"./iframe-DkOCC0M1.js";var i,a,o,s,c,l,u,d,f,p=e((()=>{i=`_badge_1x59u_1`,a=`_sm_1x59u_17`,o=`_dot_1x59u_23`,s=`_neutral_1x59u_32`,c=`_accent_1x59u_44`,l=`_success_1x59u_55`,u=`_warning_1x59u_66`,d=`_error_1x59u_77`,f={badge:i,sm:a,dot:o,neutral:s,accent:c,success:l,warning:u,error:d}})),m,h,g,_=e((()=>{m=t(n(),1),p(),h=r(),g=(0,m.forwardRef)(({variant:e=`neutral`,size:t=`md`,dot:n,className:r,children:i,...a},o)=>(0,h.jsxs)(`span`,{ref:o,className:[f.badge,f[e],t===`sm`?f.sm:``,r].filter(Boolean).join(` `),...a,children:[n&&(0,h.jsx)(`span`,{className:f.dot}),i]})),g.displayName=`Badge`,g.__docgenInfo={description:``,methods:[],displayName:`Badge`,props:{variant:{required:!1,tsType:{name:`union`,raw:`"neutral" | "accent" | "success" | "warning" | "error"`,elements:[{name:`literal`,value:`"neutral"`},{name:`literal`,value:`"accent"`},{name:`literal`,value:`"success"`},{name:`literal`,value:`"warning"`},{name:`literal`,value:`"error"`}]},description:``,defaultValue:{value:`"neutral"`,computed:!1}},size:{required:!1,tsType:{name:`union`,raw:`"sm" | "md"`,elements:[{name:`literal`,value:`"sm"`},{name:`literal`,value:`"md"`}]},description:`Compact or default size`,defaultValue:{value:`"md"`,computed:!1}},dot:{required:!1,tsType:{name:`boolean`},description:`Show a status dot before the label`},children:{required:!0,tsType:{name:`ReactNode`},description:``}},composes:[`HTMLAttributes`]}})),v,y,b,x,S,C,w;e((()=>{_(),v=r(),y={title:`Display/Badge`,component:g,tags:[`autodocs`],argTypes:{variant:{control:{type:`select`},options:[`neutral`,`accent`,`success`,`warning`,`error`]},size:{control:{type:`radio`},options:[`sm`,`md`]},dot:{control:`boolean`}}},b={args:{children:`Label`}},x={render:()=>(0,v.jsxs)(`div`,{style:{display:`flex`,gap:`0.5rem`},children:[(0,v.jsx)(g,{variant:`neutral`,children:`Neutral`}),(0,v.jsx)(g,{variant:`accent`,children:`Accent`}),(0,v.jsx)(g,{variant:`success`,children:`Success`}),(0,v.jsx)(g,{variant:`warning`,children:`Warning`}),(0,v.jsx)(g,{variant:`error`,children:`Error`})]})},S={render:()=>(0,v.jsxs)(`div`,{style:{display:`flex`,gap:`0.5rem`},children:[(0,v.jsx)(g,{variant:`success`,dot:!0,children:`Online`}),(0,v.jsx)(g,{variant:`error`,dot:!0,children:`Offline`}),(0,v.jsx)(g,{variant:`warning`,dot:!0,children:`Away`})]})},C={render:()=>(0,v.jsxs)(`div`,{style:{display:`flex`,gap:`0.5rem`,alignItems:`center`},children:[(0,v.jsx)(g,{size:`sm`,children:`Small`}),(0,v.jsx)(g,{size:`md`,children:`Medium`})]})},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Label'
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    gap: '0.5rem'
  }}>
      <Badge variant="neutral">Neutral</Badge>
      <Badge variant="accent">Accent</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="error">Error</Badge>
    </div>
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    gap: '0.5rem'
  }}>
      <Badge variant="success" dot>Online</Badge>
      <Badge variant="error" dot>Offline</Badge>
      <Badge variant="warning" dot>Away</Badge>
    </div>
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center'
  }}>
      <Badge size="sm">Small</Badge>
      <Badge size="md">Medium</Badge>
    </div>
}`,...C.parameters?.docs?.source}}},w=[`Default`,`Variants`,`WithDot`,`Sizes`]}))();export{b as Default,C as Sizes,x as Variants,S as WithDot,w as __namedExportsOrder,y as default};