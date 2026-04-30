import{n as e}from"./chunk-jRWAZmH_.js";import{t}from"./iframe-Badt6fQx.js";import{n,t as r}from"./Text-CDa8typE.js";var i,a,o,s,c,l,u;e((()=>{n(),i=t(),a={title:`Foundation/Text`,component:r,tags:[`autodocs`],argTypes:{variant:{control:{type:`select`},options:[`body`,`caption`,`detail`,`label`,`display`]},color:{control:{type:`select`},options:[`primary`,`secondary`,`tertiary`,`accent`,`success`,`warning`,`error`,`on-accent`]},align:{control:{type:`radio`},options:[`left`,`center`,`right`]},mono:{control:`boolean`},truncate:{control:`boolean`}}},o={args:{children:`The quick brown fox jumps over the lazy dog.`,variant:`body`}},s={render:()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`1rem`},children:[(0,i.jsx)(r,{variant:`display`,children:`Display Text`}),(0,i.jsx)(r,{variant:`body`,children:`Body Text (Default)`}),(0,i.jsx)(r,{variant:`label`,children:`Label Text`}),(0,i.jsx)(r,{variant:`caption`,children:`Caption Text`}),(0,i.jsx)(r,{variant:`detail`,children:`Detail Text`})]})},c={args:{mono:!0,children:`const x = 42;`}},l={render:()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`1rem`},children:[(0,i.jsx)(r,{color:`primary`,children:`Primary Text`}),(0,i.jsx)(r,{color:`secondary`,children:`Secondary Text`}),(0,i.jsx)(r,{color:`tertiary`,children:`Tertiary Text`}),(0,i.jsx)(r,{color:`accent`,children:`Accent Text`}),(0,i.jsx)(r,{color:`success`,children:`Success Text`}),(0,i.jsx)(r,{color:`warning`,children:`Warning Text`}),(0,i.jsx)(r,{color:`error`,children:`Error Text`})]})},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'The quick brown fox jumps over the lazy dog.',
    variant: 'body'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  }}>
      <Text variant="display">Display Text</Text>
      <Text variant="body">Body Text (Default)</Text>
      <Text variant="label">Label Text</Text>
      <Text variant="caption">Caption Text</Text>
      <Text variant="detail">Detail Text</Text>
    </div>
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    mono: true,
    children: 'const x = 42;'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  }}>
      <Text color="primary">Primary Text</Text>
      <Text color="secondary">Secondary Text</Text>
      <Text color="tertiary">Tertiary Text</Text>
      <Text color="accent">Accent Text</Text>
      <Text color="success">Success Text</Text>
      <Text color="warning">Warning Text</Text>
      <Text color="error">Error Text</Text>
    </div>
}`,...l.parameters?.docs?.source}}},u=[`Default`,`Variants`,`Monospace`,`Colors`]}))();export{l as Colors,o as Default,c as Monospace,s as Variants,u as __namedExportsOrder,a as default};