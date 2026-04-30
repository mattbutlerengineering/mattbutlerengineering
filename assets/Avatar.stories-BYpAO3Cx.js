import{n as e,o as t}from"./chunk-jRWAZmH_.js";import{k as n,t as r}from"./iframe-DND2Mrw8.js";import{a as i,n as a,t as o}from"./es-COP3gkbB.js";var s,c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E,D,O=e((()=>{s=`_avatar_20v56_2`,c=`_sm_20v56_30`,l=`_md_20v56_34`,u=`_lg_20v56_38`,d=`_xl_20v56_42`,f=`_image_20v56_48`,p=`_initials_20v56_57`,m=`_status_20v56_85`,h=`_online_20v56_122`,g=`_offline_20v56_126`,_=`_busy_20v56_130`,v=`_away_20v56_134`,y=`_group_20v56_159`,b=`_overflow_20v56_179 _avatar_20v56_2`,x=`_overflowText_20v56_185`,S=`_flapStage_20v56_197`,C=`_flapHalf_20v56_203`,w=`_flapHalfTop_20v56_211`,T=`_flapHalfBottom_20v56_216`,E=`_flapImage_20v56_221`,D={avatar:s,sm:c,md:l,lg:u,xl:d,image:f,initials:p,status:m,online:h,offline:g,busy:_,away:v,"rialto-avatar-led-breathe":`_rialto-avatar-led-breathe_20v56_1`,group:y,overflow:b,overflowText:x,flapStage:S,flapHalf:C,flapHalfTop:w,flapHalfBottom:T,flapImage:E}}));function k(e){return e.split(/\s+/).slice(0,2).map(e=>e[0]).join(``).toUpperCase()}function A({prevSrc:e,onComplete:t}){return(0,M.jsxs)(`div`,{className:D.flapStage,"aria-hidden":`true`,"data-testid":`avatar-flap-stage`,children:[(0,M.jsx)(i.div,{className:`${D.flapHalf} ${D.flapHalfTop}`,initial:{rotateX:0},animate:{rotateX:-180},transition:{duration:N/1e3,ease:`easeIn`},children:(0,M.jsx)(`img`,{className:D.flapImage,src:e,alt:``})}),(0,M.jsx)(i.div,{className:`${D.flapHalf} ${D.flapHalfBottom}`,initial:{rotateX:0},animate:{rotateX:180},transition:{duration:N/1e3,delay:P/1e3,ease:`easeIn`},onAnimationComplete:t,children:(0,M.jsx)(`img`,{className:D.flapImage,src:e,alt:``})})]})}var j,M,N,P,F,I,L=e((()=>{j=t(n(),1),o(),O(),M=r(),N=280,P=80,F=(0,j.forwardRef)(({src:e,alt:t,name:n,size:r=`md`,status:i,transition:o=`fade`,className:s},c)=>{let[l,u]=(0,j.useState)(null),d=a(),f=(0,j.useRef)(e),p=(0,j.useRef)(0),[m,h]=(0,j.useState)(null);(0,j.useEffect)(()=>{let t=f.current;f.current=e,o===`splitflap`&&(!t||!e||t===e||d||(p.current+=1,h({prevSrc:t,key:p.current})))},[e,o,d]);let g=!!e&&l!==e,_=n?k(n):void 0;return(0,M.jsxs)(`div`,{ref:c,className:[D.avatar,D[r],s].filter(Boolean).join(` `),"aria-label":t??n,children:[g?(0,M.jsxs)(M.Fragment,{children:[(0,M.jsx)(`img`,{className:D.image,src:e,alt:t??n??``,onError:()=>u(e??null)}),m&&(0,M.jsx)(A,{prevSrc:m.prevSrc,onComplete:()=>h(null)},m.key)]}):_?(0,M.jsx)(`span`,{className:D.initials,children:_}):(0,M.jsxs)(`svg`,{width:`60%`,height:`60%`,viewBox:`0 0 16 16`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.2`,strokeLinecap:`round`,"aria-hidden":`true`,style:{color:`var(--rialto-text-tertiary)`},children:[(0,M.jsx)(`circle`,{cx:`8`,cy:`6`,r:`2.5`}),(0,M.jsx)(`path`,{d:`M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5`})]}),i&&(0,M.jsx)(`span`,{className:`${D.status} ${D[i]}`,role:`img`,"aria-label":i})]})}),F.displayName=`Avatar`,I=(0,j.forwardRef)(({avatars:e,max:t=4,size:n=`md`,className:r},i)=>{let a=e.slice(0,t),o=e.length-t;return(0,M.jsxs)(`div`,{ref:i,className:[D.group,r].filter(Boolean).join(` `),children:[o>0&&(0,M.jsx)(`div`,{className:`${D.overflow} ${D[n]}`,"aria-label":`${o} more`,children:(0,M.jsxs)(`span`,{className:D.overflowText,"aria-hidden":`true`,children:[`+`,o]})}),[...a].reverse().map((e,t)=>(0,M.jsx)(F,{...e,size:n},t))]})}),I.displayName=`AvatarGroup`,F.__docgenInfo={description:``,methods:[],displayName:`Avatar`,props:{src:{required:!1,tsType:{name:`string`},description:``},alt:{required:!1,tsType:{name:`string`},description:``},name:{required:!1,tsType:{name:`string`},description:``},size:{required:!1,tsType:{name:`union`,raw:`"sm" | "md" | "lg" | "xl"`,elements:[{name:`literal`,value:`"sm"`},{name:`literal`,value:`"md"`},{name:`literal`,value:`"lg"`},{name:`literal`,value:`"xl"`}]},description:``,defaultValue:{value:`"md"`,computed:!1}},status:{required:!1,tsType:{name:`union`,raw:`"online" | "offline" | "busy" | "away"`,elements:[{name:`literal`,value:`"online"`},{name:`literal`,value:`"offline"`},{name:`literal`,value:`"busy"`},{name:`literal`,value:`"away"`}]},description:``},transition:{required:!1,tsType:{name:`union`,raw:`"fade" | "splitflap"`,elements:[{name:`literal`,value:`"fade"`},{name:`literal`,value:`"splitflap"`}]},description:'How the avatar reacts when `src` changes.\n- `"fade"` (default) — swap instantly, matching the legacy behavior.\n- `"splitflap"` — run the new image through a two-flap horizontal reveal\n  that mirrors the library\'s SplitFlap aesthetic. Honors\n  `prefers-reduced-motion` by snapping directly.',defaultValue:{value:`"fade"`,computed:!1}},className:{required:!1,tsType:{name:`string`},description:``}}},I.__docgenInfo={description:``,methods:[],displayName:`AvatarGroup`,props:{avatars:{required:!0,tsType:{name:`Array`,elements:[{name:`AvatarProps`}],raw:`AvatarProps[]`},description:``},max:{required:!1,tsType:{name:`number`},description:`Maximum visible avatars before showing a "+N" overflow counter`,defaultValue:{value:`4`,computed:!1}},size:{required:!1,tsType:{name:`AvatarProps["size"]`,raw:`AvatarProps["size"]`},description:``,defaultValue:{value:`"md"`,computed:!1}},className:{required:!1,tsType:{name:`string`},description:``}}}})),R,z,B,V,H,U,W,G;e((()=>{L(),R=r(),z={title:`Display/Avatar`,component:F,tags:[`autodocs`],argTypes:{size:{control:{type:`radio`},options:[`sm`,`md`,`lg`,`xl`]},status:{control:{type:`select`},options:[`online`,`offline`,`busy`,`away`]},transition:{control:{type:`radio`},options:[`fade`,`splitflap`]}}},B={args:{name:`Matt Butler`,size:`md`}},V={args:{src:`https://i.pravatar.cc/150?u=mbe`,name:`User Name`,size:`lg`}},H={render:()=>(0,R.jsxs)(`div`,{style:{display:`flex`,gap:`1rem`},children:[(0,R.jsx)(F,{name:`Online User`,status:`online`}),(0,R.jsx)(F,{name:`Busy User`,status:`busy`}),(0,R.jsx)(F,{name:`Away User`,status:`away`}),(0,R.jsx)(F,{name:`Offline User`,status:`offline`})]})},U={render:()=>(0,R.jsxs)(`div`,{style:{display:`flex`,gap:`1rem`,alignItems:`center`},children:[(0,R.jsx)(F,{name:`Small`,size:`sm`}),(0,R.jsx)(F,{name:`Medium`,size:`md`}),(0,R.jsx)(F,{name:`Large`,size:`lg`}),(0,R.jsx)(F,{name:`Extra Large`,size:`xl`})]})},W={render:()=>(0,R.jsx)(I,{avatars:[{name:`Alice`,src:`https://i.pravatar.cc/150?u=alice`},{name:`Bob`,src:`https://i.pravatar.cc/150?u=bob`},{name:`Charlie`,src:`https://i.pravatar.cc/150?u=charlie`},{name:`David`,src:`https://i.pravatar.cc/150?u=david`},{name:`Eve`,src:`https://i.pravatar.cc/150?u=eve`}],max:4})},B.parameters={...B.parameters,docs:{...B.parameters?.docs,source:{originalSource:`{
  args: {
    name: 'Matt Butler',
    size: 'md'
  }
}`,...B.parameters?.docs?.source}}},V.parameters={...V.parameters,docs:{...V.parameters?.docs,source:{originalSource:`{
  args: {
    src: 'https://i.pravatar.cc/150?u=mbe',
    name: 'User Name',
    size: 'lg'
  }
}`,...V.parameters?.docs?.source}}},H.parameters={...H.parameters,docs:{...H.parameters?.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    gap: '1rem'
  }}>
      <Avatar name="Online User" status="online" />
      <Avatar name="Busy User" status="busy" />
      <Avatar name="Away User" status="away" />
      <Avatar name="Offline User" status="offline" />
    </div>
}`,...H.parameters?.docs?.source}}},U.parameters={...U.parameters,docs:{...U.parameters?.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    gap: '1rem',
    alignItems: 'center'
  }}>
      <Avatar name="Small" size="sm" />
      <Avatar name="Medium" size="md" />
      <Avatar name="Large" size="lg" />
      <Avatar name="Extra Large" size="xl" />
    </div>
}`,...U.parameters?.docs?.source}}},W.parameters={...W.parameters,docs:{...W.parameters?.docs,source:{originalSource:`{
  render: () => <AvatarGroup avatars={[{
    name: 'Alice',
    src: 'https://i.pravatar.cc/150?u=alice'
  }, {
    name: 'Bob',
    src: 'https://i.pravatar.cc/150?u=bob'
  }, {
    name: 'Charlie',
    src: 'https://i.pravatar.cc/150?u=charlie'
  }, {
    name: 'David',
    src: 'https://i.pravatar.cc/150?u=david'
  }, {
    name: 'Eve',
    src: 'https://i.pravatar.cc/150?u=eve'
  }]} max={4} />
}`,...W.parameters?.docs?.source}}},G=[`Default`,`WithImage`,`WithStatus`,`Sizes`,`Group`]}))();export{B as Default,W as Group,U as Sizes,V as WithImage,H as WithStatus,G as __namedExportsOrder,z as default};