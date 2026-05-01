import{n as e}from"./chunk-jRWAZmH_.js";import{t}from"./iframe-DkOCC0M1.js";import{i as n,n as r,r as i,t as a}from"./Stack-_uDTsg8j.js";import{n as o,t as s}from"./Text-Bn7KiMjQ.js";var c,l,u,d,f,p,m;e((()=>{r(),n(),o(),c=t(),l={title:`Layout/Stack`,component:a,tags:[`autodocs`],argTypes:{direction:{control:{type:`radio`},options:[`column`,`row`]},gap:{control:{type:`select`},options:[`2xs`,`xs`,`sm`,`md`,`lg`,`xl`,`2xl`,`3xl`]},align:{control:{type:`select`},options:[`start`,`center`,`end`,`stretch`,`baseline`]},justify:{control:{type:`select`},options:[`start`,`center`,`end`,`between`]},wrap:{control:`boolean`}}},u=({children:e})=>(0,c.jsx)(`div`,{style:{padding:`1rem`,background:`var(--rialto-color-accent-subtle)`,border:`1px solid var(--rialto-color-accent)`,borderRadius:`4px`,minWidth:`50px`,textAlign:`center`},children:e}),d={args:{direction:`column`,gap:`md`,children:(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)(u,{children:`Item 1`}),(0,c.jsx)(u,{children:`Item 2`}),(0,c.jsx)(u,{children:`Item 3`})]})}},f={args:{direction:`row`,gap:`md`,children:(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)(u,{children:`Item 1`}),(0,c.jsx)(u,{children:`Item 2`}),(0,c.jsx)(u,{children:`Item 3`})]})}},p={render:()=>(0,c.jsxs)(a,{gap:`xl`,children:[(0,c.jsxs)(a,{gap:`sm`,children:[(0,c.jsx)(s,{variant:`label`,children:`Section Header`}),(0,c.jsx)(`div`,{style:{height:`2px`,background:`var(--rialto-color-border)`}})]}),(0,c.jsxs)(a,{direction:`row`,gap:`lg`,align:`center`,justify:`between`,children:[(0,c.jsx)(i,{style:{padding:`1rem`,flex:1},children:(0,c.jsx)(s,{children:`Content A`})}),(0,c.jsx)(i,{style:{padding:`1rem`,flex:1},children:(0,c.jsx)(s,{children:`Content B`})})]})]})},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    direction: 'column',
    gap: 'md',
    children: <>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
      </>
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    direction: 'row',
    gap: 'md',
    children: <>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
      </>
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <Stack gap="xl">
      <Stack gap="sm">
        <Text variant="label">Section Header</Text>
        <div style={{
        height: '2px',
        background: 'var(--rialto-color-border)'
      }} />
      </Stack>
      <Stack direction="row" gap="lg" align="center" justify="between">
        <Card style={{
        padding: '1rem',
        flex: 1
      }}>
          <Text>Content A</Text>
        </Card>
        <Card style={{
        padding: '1rem',
        flex: 1
      }}>
          <Text>Content B</Text>
        </Card>
      </Stack>
    </Stack>
}`,...p.parameters?.docs?.source}}},m=[`Vertical`,`Horizontal`,`ComplexLayout`]}))();export{p as ComplexLayout,f as Horizontal,d as Vertical,m as __namedExportsOrder,l as default};