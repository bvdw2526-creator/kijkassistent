import { ImageResponse } from 'next/og'

// Voorbeeldafbeelding bij het delen van de site (WhatsApp, Facebook, enzovoort).
export const alt = 'Kijkassistent: film- en serietips op jouw streamingdiensten'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 90px',
          background: 'linear-gradient(135deg, #10151C 0%, #1A2330 100%)',
          color: '#F2EFE9',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, letterSpacing: 8, color: '#E8A33D', fontWeight: 700 }}>KIJKASSISTENT</div>
        <div style={{ display: 'flex', fontSize: 74, fontWeight: 700, lineHeight: 1.1, marginTop: 28 }}>
          Wat kijk je vanavond?
        </div>
        <div style={{ display: 'flex', fontSize: 36, color: '#93A3B5', marginTop: 28, lineHeight: 1.3 }}>
          Film- en serietips die bij jou passen en op jouw streamingdiensten staan. Ook samen met je partner.
        </div>
      </div>
    ),
    size
  )
}
