export function WebGPUUnavailable() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="panel" style={{ maxWidth: 560, padding: 24 }}>
        <h1 style={{ marginTop: 0, fontSize: 22, color: "var(--text-h)" }}>
          WebGPU is required
        </h1>
        <p>
          This tornado simulator runs a real Large-Eddy Simulation of the
          Navier&ndash;Stokes equations on the GPU using WebGPU compute shaders.
          Your browser doesn&rsquo;t expose <code>navigator.gpu</code>.
        </p>
        <p className="dim" style={{ marginBottom: 0 }}>
          Try a recent build of Chrome, Edge, Safari (macOS Tahoe / iOS 26+), or
          Firefox 147+.
        </p>
      </div>
    </div>
  );
}
