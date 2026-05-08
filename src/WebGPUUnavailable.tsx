export function WebGPUUnavailable() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div className="panel" style={{ maxWidth: 560, padding: 24 }}>
        <h1 style={{ marginTop: 0, fontSize: 22, color: 'var(--text-h)' }}>WebGPU est requis</h1>
        <p>
          Ce simulateur de tornade exécute une vraie simulation LES des équations de
          Navier&ndash;Stokes sur le GPU avec des shaders de calcul WebGPU. Votre navigateur
          n&rsquo;expose pas <code>navigator.gpu</code>.
        </p>
        <p className="dim" style={{ marginBottom: 0 }}>
          Essayez une version récente de Chrome, Edge, Safari (macOS Tahoe / iOS 26+) ou Firefox
          147+.
        </p>
      </div>
    </div>
  )
}
