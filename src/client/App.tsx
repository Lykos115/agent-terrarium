import Canvas from "./Canvas";

/** React shell — mounts the PixiJS Canvas. */
export default function App() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#0f0f23" }}>
      <Canvas />
    </div>
  );
}
