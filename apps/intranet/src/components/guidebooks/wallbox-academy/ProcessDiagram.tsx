/**
 * Static process diagram for the Warm-Lead call chapter. Fixed light colours
 * (not theme tokens) — it's a small illustration meant to read the same in
 * light and dark mode, framed in its own light backdrop rather than trying to
 * theme individual shapes.
 */
export function ProcessDiagram() {
  return (
    <div className="mb-4 overflow-x-auto rounded-lg border border-border bg-[#f6f8f7] p-3">
      <svg
        viewBox="0 0 700 330"
        role="img"
        aria-label="Prozessgrafik Warm-Lead-Call in vier Schritten"
        style={{ width: "100%", height: "auto", maxWidth: 700 }}
      >
        <defs>
          <marker
            id="wsa-arrow"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={7}
            markerHeight={7}
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="#152227" />
          </marker>
        </defs>

        <rect x={20} y={28} width={180} height={66} rx={10} fill="#f6f8f7" stroke="#152227" strokeWidth={1.5} />
        <circle cx={46} cy={54} r={13} fill="#d9f26b" />
        <text x={46} y={59} textAnchor="middle" fontSize={13} fontWeight={700} fill="#3f4d0c">1</text>
        <text x={66} y={52} fontSize={13} fontWeight={600} fill="#152227">Leadliste</text>
        <text x={66} y={69} fontSize={11} fill="#5c6d73">Zugeteilte Bestands-</text>
        <text x={66} y={82} fontSize={11} fill="#5c6d73">kunden abarbeiten</text>

        <line x1={200} y1={61} x2={252} y2={61} stroke="#152227" strokeWidth={1.5} markerEnd="url(#wsa-arrow)" />

        <rect x={258} y={28} width={188} height={66} rx={10} fill="#f6f8f7" stroke="#152227" strokeWidth={1.5} />
        <circle cx={284} cy={54} r={13} fill="#d9f26b" />
        <text x={284} y={59} textAnchor="middle" fontSize={13} fontWeight={700} fill="#3f4d0c">2</text>
        <text x={304} y={52} fontSize={13} fontWeight={600} fill="#152227">Kontakt-Check</text>
        <text x={304} y={69} fontSize={11} fill="#5c6d73">Account + Opportunities</text>
        <text x={304} y={82} fontSize={11} fill="#5c6d73">in Salesforce pruefen</text>
        <text x={352} y={112} textAnchor="middle" fontSize={11} fill="#b0322e">
          Kontakt vor weniger als 3 Monaten? Nicht anrufen.
        </text>

        <line x1={446} y1={61} x2={498} y2={61} stroke="#152227" strokeWidth={1.5} markerEnd="url(#wsa-arrow)" />

        <rect x={504} y={28} width={176} height={66} rx={10} fill="#f6f8f7" stroke="#152227" strokeWidth={1.5} />
        <circle cx={530} cy={54} r={13} fill="#d9f26b" />
        <text x={530} y={59} textAnchor="middle" fontSize={13} fontWeight={700} fill="#3f4d0c">3</text>
        <text x={550} y={52} fontSize={13} fontWeight={600} fill="#152227">Anruf</text>
        <text x={550} y={69} fontSize={11} fill="#5c6d73">Service-Call-Einstieg,</text>
        <text x={550} y={82} fontSize={11} fill="#5c6d73">Gespraechsleitfaden</text>

        <line x1={592} y1={94} x2={592} y2={140} stroke="#152227" strokeWidth={1.5} />
        <line x1={265} y1={140} x2={592} y2={140} stroke="#152227" strokeWidth={1.5} />
        <line x1={265} y1={140} x2={265} y2={176} stroke="#152227" strokeWidth={1.5} markerEnd="url(#wsa-arrow)" />
        <line x1={555} y1={140} x2={555} y2={176} stroke="#152227" strokeWidth={1.5} markerEnd="url(#wsa-arrow)" />
        <text x={265} y={166} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0a5b4b">Opportunity vorhanden</text>
        <text x={555} y={166} textAnchor="middle" fontSize={11} fontWeight={600} fill="#b45309">keine Opportunity</text>

        <rect x={140} y={182} width={252} height={118} rx={10} fill="#e6f4ef" stroke="#0e7c66" strokeWidth={1.5} />
        <text x={160} y={206} fontSize={13} fontWeight={700} fill="#0a5b4b">4a  Opportunity anlegen</text>
        <text x={160} y={226} fontSize={11} fill="#0a5b4b">In Salesforce erfassen:</text>
        <text x={160} y={242} fontSize={11} fill="#0a5b4b">- EV-Buddy als &quot;Opportunity Owner&quot;</text>
        <text x={160} y={258} fontSize={11} fill="#0a5b4b">- Sales Manager als &quot;Acquired by&quot;</text>
        <text x={160} y={280} fontSize={11} fontWeight={600} fill="#0a5b4b">Ziel: Angebot oder Expertenberatung</text>

        <rect x={430} y={182} width={252} height={118} rx={10} fill="#fef3e2" stroke="#b45309" strokeWidth={1.5} />
        <text x={450} y={206} fontSize={13} fontWeight={700} fill="#b45309">4b  Account pflegen</text>
        <text x={450} y={226} fontSize={11} fill="#8a4207">Keine Opportunity anlegen, aber:</text>
        <text x={450} y={242} fontSize={11} fill="#8a4207">- alle relevanten Daten erfassen</text>
        <text x={450} y={258} fontSize={11} fill="#8a4207">- Potenzial fuer spaeter bewerten</text>
        <text x={450} y={280} fontSize={11} fontWeight={600} fill="#8a4207">Ziel: Follow-up-Termin gesetzt</text>
      </svg>
    </div>
  );
}
