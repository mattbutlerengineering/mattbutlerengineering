import{n as e,o as t}from"./chunk-jRWAZmH_.js";import{k as n,t as r}from"./iframe-DkOCC0M1.js";var i,a,o,s,c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w=e((()=>{i=`_heading_142zo_6`,a=`_size1_142zo_21`,o=`_size2_142zo_24`,s=`_size3_142zo_27`,c=`_size4_142zo_30`,l=`_size5_142zo_33`,u=`_size6_142zo_39`,d=`_colorPrimary_142zo_48`,f=`_colorSecondary_142zo_51`,p=`_colorTertiary_142zo_54`,m=`_colorAccent_142zo_57`,h=`_colorSuccess_142zo_60`,g=`_colorWarning_142zo_63`,_=`_colorError_142zo_66`,v=`_colorOnAccent_142zo_69`,y=`_alignLeft_142zo_75`,b=`_alignCenter_142zo_78`,x=`_alignRight_142zo_81`,S=`_truncate_142zo_87`,C={heading:i,size1:a,size2:o,size3:s,size4:c,size5:l,size6:u,colorPrimary:d,colorSecondary:f,colorTertiary:p,colorAccent:m,colorSuccess:h,colorWarning:g,colorError:_,colorOnAccent:v,alignLeft:y,alignCenter:b,alignRight:x,truncate:S}})),T,E,D,O,k,A,j=e((()=>{T=t(n(),1),w(),E=r(),D={1:`size1`,2:`size2`,3:`size3`,4:`size4`,5:`size5`,6:`size6`},O={primary:`colorPrimary`,secondary:`colorSecondary`,tertiary:`colorTertiary`,accent:`colorAccent`,success:`colorSuccess`,warning:`colorWarning`,error:`colorError`,"on-accent":`colorOnAccent`},k={left:`alignLeft`,center:`alignCenter`,right:`alignRight`},A=(0,T.forwardRef)(({level:e=2,size:t,color:n,align:r,as:i,truncate:a=!1,className:o,children:s,...c},l)=>{let u=i??`h${e}`,d=t??e;return(0,E.jsx)(u,{ref:l,className:[C.heading,C[D[d]],n?C[O[n]]:``,r?C[k[r]]:``,a?C.truncate:``,o].filter(Boolean).join(` `),...c,children:s})}),A.displayName=`Heading`,A.__docgenInfo={description:``,methods:[],displayName:`Heading`,props:{level:{required:!1,tsType:{name:`union`,raw:`1 | 2 | 3 | 4 | 5 | 6`,elements:[{name:`literal`,value:`1`},{name:`literal`,value:`2`},{name:`literal`,value:`3`},{name:`literal`,value:`4`},{name:`literal`,value:`5`},{name:`literal`,value:`6`}]},description:`Semantic heading level — also the default rendered element. @default 2`,defaultValue:{value:`2`,computed:!1}},size:{required:!1,tsType:{name:`union`,raw:`1 | 2 | 3 | 4 | 5 | 6`,elements:[{name:`literal`,value:`1`},{name:`literal`,value:`2`},{name:`literal`,value:`3`},{name:`literal`,value:`4`},{name:`literal`,value:`5`},{name:`literal`,value:`6`}]},description:"Visual size override. Defaults to `level`."},color:{required:!1,tsType:{name:`union`,raw:`| "primary"
| "secondary"
| "tertiary"
| "accent"
| "success"
| "warning"
| "error"
| "on-accent"`,elements:[{name:`literal`,value:`"primary"`},{name:`literal`,value:`"secondary"`},{name:`literal`,value:`"tertiary"`},{name:`literal`,value:`"accent"`},{name:`literal`,value:`"success"`},{name:`literal`,value:`"warning"`},{name:`literal`,value:`"error"`},{name:`literal`,value:`"on-accent"`}]},description:`Override the default color for the level`},align:{required:!1,tsType:{name:`union`,raw:`"left" | "center" | "right"`,elements:[{name:`literal`,value:`"left"`},{name:`literal`,value:`"center"`},{name:`literal`,value:`"right"`}]},description:`Text alignment`},as:{required:!1,tsType:{name:`ElementType`},description:`Render as a different HTML element (e.g., "div" for visual-only headings)`},truncate:{required:!1,tsType:{name:`boolean`},description:`Truncate with ellipsis (single line)`,defaultValue:{value:`false`,computed:!1}},children:{required:!1,tsType:{name:`ReactNode`},description:``}},composes:[`HTMLAttributes`]}})),M,N,P,F,I,L,R;e((()=>{j(),M=r(),N={title:`Foundation/Heading`,component:A,tags:[`autodocs`],argTypes:{level:{control:{type:`select`},options:[1,2,3,4,5,6]},size:{control:{type:`select`},options:[1,2,3,4,5,6]},color:{control:{type:`select`},options:[`primary`,`secondary`,`tertiary`,`accent`,`success`,`warning`,`error`,`on-accent`]},align:{control:{type:`radio`},options:[`left`,`center`,`right`]},truncate:{control:`boolean`}}},P={args:{children:`The quick brown fox`,level:2}},F={render:()=>(0,M.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`1rem`},children:[(0,M.jsx)(A,{level:1,children:`Heading 1`}),(0,M.jsx)(A,{level:2,children:`Heading 2`}),(0,M.jsx)(A,{level:3,children:`Heading 3`}),(0,M.jsx)(A,{level:4,children:`Heading 4`}),(0,M.jsx)(A,{level:5,children:`Heading 5`}),(0,M.jsx)(A,{level:6,children:`Heading 6`})]})},I={render:()=>(0,M.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`1rem`},children:[(0,M.jsx)(A,{color:`primary`,children:`Primary Heading`}),(0,M.jsx)(A,{color:`secondary`,children:`Secondary Heading`}),(0,M.jsx)(A,{color:`accent`,children:`Accent Heading`}),(0,M.jsx)(A,{color:`success`,children:`Success Heading`}),(0,M.jsx)(A,{color:`warning`,children:`Warning Heading`}),(0,M.jsx)(A,{color:`error`,children:`Error Heading`})]})},L={args:{level:2,size:1,children:`Semantic H2, Visual Size 1`}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'The quick brown fox',
    level: 2
  }
}`,...P.parameters?.docs?.source}}},F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  }}>
      <Heading level={1}>Heading 1</Heading>
      <Heading level={2}>Heading 2</Heading>
      <Heading level={3}>Heading 3</Heading>
      <Heading level={4}>Heading 4</Heading>
      <Heading level={5}>Heading 5</Heading>
      <Heading level={6}>Heading 6</Heading>
    </div>
}`,...F.parameters?.docs?.source}}},I.parameters={...I.parameters,docs:{...I.parameters?.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  }}>
      <Heading color="primary">Primary Heading</Heading>
      <Heading color="secondary">Secondary Heading</Heading>
      <Heading color="accent">Accent Heading</Heading>
      <Heading color="success">Success Heading</Heading>
      <Heading color="warning">Warning Heading</Heading>
      <Heading color="error">Error Heading</Heading>
    </div>
}`,...I.parameters?.docs?.source}}},L.parameters={...L.parameters,docs:{...L.parameters?.docs,source:{originalSource:`{
  args: {
    level: 2,
    size: 1,
    children: 'Semantic H2, Visual Size 1'
  }
}`,...L.parameters?.docs?.source}}},R=[`Default`,`Levels`,`Colors`,`SizeOverride`]}))();export{I as Colors,P as Default,F as Levels,L as SizeOverride,R as __namedExportsOrder,N as default};