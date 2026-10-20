/** Original vector game art. Local, scalable, and readable in exported slides. */
export function ThomasSprite({ tired = false, companion = false }: { tired?: boolean; companion?: boolean }) {
  return <svg viewBox="0 0 88 112" aria-label={companion ? "Kate, Thomas’s co-pilot" : "Thomas, first-time homebuyer"} role="img" className="pain-sprite" shapeRendering="crispEdges">
    <ellipse cx="44" cy="106" rx="32" ry="5" fill="#07182b" opacity=".35" />
    <path d="M26 71h15v31H26zm21 0h15v31H47z" fill="#263c54" />
    <path d="M21 99h21v8H18v-5h3zm25 0h18l7 4v4H46z" fill="#edf1e1" />
    <path d="M22 45h44v31H22z" fill={companion ? "#55c7df" : tired ? "#748194" : "#ecad5c"} />
    <path d="M15 49h9v27h-9zm49 0h9v27h-9z" fill="#e8af88" />
    <path d="M34 38h20v13H34z" fill="#d79773" />
    <path d="M25 14h38v27H25zM20 19h5v16h-5zm43 0h5v16h-5z" fill="#efbd97" />
    <path d="M25 7h33v7h10v12h-9V17H34v7H24v-5h-4V12h5z" fill="#493b3b" />
    <path d="M32 27h5v5h-5zm20 0h5v5h-5z" fill="#263447" />
    <path d={tired ? "M37 39h14v3H37z" : "M38 36h12v3H38z"} fill="#b36e5c" />
    {tired && <path d="M73 27h5v8h-5zm-5 8h10v5H68z" fill="#79c6df" />}
    {companion && <path d="M38 56h12v4H38zm4-4h4v12h-4z" fill="#0d2a50" />}
  </svg>;
}

export function HouseWorld({ damaged = false, restored = false, compact = false }: { damaged?: boolean; restored?: boolean; compact?: boolean }) {
  return <svg viewBox="0 0 720 540" role="img" aria-label={damaged ? "Thomas’s house with unfinished renovation works" : "An illustrated brick house in a small game world"} className={`pain-world ${compact ? "pain-world-compact" : ""}`}>
    <defs>
      <linearGradient id="pain-ground" x2="0" y2="1"><stop stopColor="#9fb295" /><stop offset="1" stopColor="#6f9187" /></linearGradient>
      <linearGradient id="pain-wall" x2="0" y2="1"><stop stopColor="#dda17f" /><stop offset="1" stopColor="#b77762" /></linearGradient>
      <pattern id="pain-bricks" width="34" height="18" patternUnits="userSpaceOnUse"><path d="M0 0h34M0 18h34M17 0v9M0 9h34M0 9v9M34 9v9" stroke="#704e4a" strokeWidth="1" opacity=".18" /></pattern>
    </defs>
    <ellipse cx="365" cy="439" rx="275" ry="53" fill="#020e21" opacity=".28" />
    <g className="pain-island">
      <path d="m51 354 323-154 291 145v41L344 523 51 393z" fill="#334b52" />
      <path d="m51 354 323-154 291 145-321 145z" fill="url(#pain-ground)" />
      <path d="m264 411 77-39 118 57-79 37z" fill="#d3c4a5" />
      <path d="m288 422 69-34m-45 46 69-34m-45 46 69-34" stroke="#b3a88f" strokeWidth="3" />
      <path d="m137 329 120-60 64 32-120 61z" fill="#567e70" />
      <g stroke="#d7d7b1" strokeWidth="5"><path d="M95 341v-30m22 20v-30m22 19v-30m22 19v-30m22 19v-30M95 322l89-44M95 333l89-44" /></g>
      <g transform="translate(545 272)"><path d="M0 77V8" stroke="#67574c" strokeWidth="10" /><path d="m0-65-45 75h90z" fill="#6b9780" /><path d="m0-41-54 80H54z" fill="#729e85" /><path d="m0-11-60 78H60z" fill="#82ab8d" /></g>
      <g transform="translate(145 247) scale(.75)"><path d="M0 77V8" stroke="#67574c" strokeWidth="10" /><path d="m0-65-45 75h90z" fill="#6b9780" /><path d="m0-41-54 80H54z" fill="#82ab8d" /></g>
      <path d="m232 255 132-67 128 66v121l-131 66-129-65z" fill="url(#pain-wall)" />
      <path d="m361 315 131-61v121l-131 66z" fill="#a96e5c" />
      <path d="m232 255 132-67 128 66v121l-131 66-129-65z" fill="url(#pain-bricks)" />
      <path d="m214 253 94-134 153 77 47 57-145 74z" fill="#283b50" />
      <path d="m214 253 94-134 62 143-7 65z" fill="#3c5368" />
      <path d="m308 119 153 77 47 57-138 9z" fill={restored ? "#4c6676" : "#52697a"} />
      <path d="m322 147 137 69m-127-47 143 69m-132-48 137 68m-129-47 91 45" stroke="#9eb0b3" opacity=".25" strokeWidth="3" />
      <path d="m426 175 0-54 23 12v54z" fill="#a96e5c" /><path d="m417 121 13-7 29 15-10 7z" fill="#d9a88c" />
      <path d="m258 280 39 20v48l-39-20zm65 33 24 12v47l-24-12z" fill="#ffe0a1" stroke="#79584f" strokeWidth="5" />
      <path d="M278 291v46m-20-32 39 20" stroke="#f8ead1" strokeWidth="3" />
      <path d="m396 316 51-24v43l-51 24z" fill="#ffe0a1" stroke="#76594f" strokeWidth="5" /><path d="m421 305 0 42m-25-11 51-24" stroke="#f8ead1" strokeWidth="3" />
      <path d="m306 350 36 18v62l-36-18z" fill="#536965" stroke="#79584f" strokeWidth="4" /><path d="m315 362 18 9v22l-18-9z" fill="#bbd4c0" /><circle cx="334" cy="403" r="2" fill="#ffd48d" />
      {restored && <g><path d="m356 165 69 35 18 34-71-35z" fill="#173f61" stroke="#7ca9b7" strokeWidth="2" /><path d="m380 177 15 34m8-22 16 34m-54-38 72 36" stroke="#7ca9b7" strokeWidth="1" /></g>}
      {damaged && <g>
        <path d="m234 276 0 112m37-93v113m-42-66 61 31m-61-2 61 31m-61-92 61 31m-61-2 61 31" stroke="#d5bea0" strokeWidth="6" />
        <path d="m442 392 42-20 45 22-43 20z" fill="#caa781" /><path d="m454 380 27-14 25 13-27 14z" fill="#d9bb93" />
        <path d="m391 436 8-22 9 28z" fill="#f6b258" /><path d="m389 436 23 11" stroke="#f4dfb9" strokeWidth="4" />
        <path d="m345 211 13 8-2 18 15 8" stroke="#14283d" strokeWidth="4" fill="none" />
      </g>}
      <g transform="translate(523 379)"><path d="M0 0v66" stroke="#d9bb8d" strokeWidth="6" /><path d="m-25-7 62-29v33L-25 26z" fill={damaged ? "#dd7775" : "#edca8b"} /><text x="17" y="2" textAnchor="middle" transform="rotate(-26 17 2)" fill="#233c4a" fontSize="12" fontFamily="monospace" fontWeight="bold">{damaged ? "ON HOLD" : "THE ONE"}</text></g>
      <path d="m166 389 26-13 22 12-26 12z" fill="#547b68" /><path d="m178 361 0 29" stroke="#9db487" strokeWidth="3" /><circle cx="178" cy="355" r="9" fill="#dbbb7b" />
    </g>
    {!compact && <g className="pain-clouds" fill="#d7e2de" opacity=".15"><path d="M104 134h89v10h20v13H84v-13h20z" /><path d="M518 95h79v10h20v13H498v-13h20z" /></g>}
  </svg>;
}
