import React from "react";

export default function MyComponent() {
  React.useEffect(() => { console.error("CHAOS-ERROR: Synthetic bug for #MyComponent"); }, []);

  return (
    <div aria-label="test-label">
      <h1>Hello</h1>
    </div>
  );
}
    