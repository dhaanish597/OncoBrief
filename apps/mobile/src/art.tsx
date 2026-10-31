import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect, G, Line } from 'react-native-svg';
import { theme as c } from './theme';
/** Original decorative line illustration. It represents connection, never patient anatomy. */
export function CareIllustration({ compact = false }: { compact?: boolean }) {
  return <Svg width="100%" height={compact ? 145 : 290} viewBox="0 0 380 290" accessible={false}>
    <Ellipse cx="190" cy="178" rx="160" ry="102" fill={c.deep}/>
    <Circle cx="302" cy="66" r="45" fill={c.blue}/><Circle cx="55" cy="142" r="28" fill={c.sage}/>
    <G stroke={c.cobalt} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 255 C50 220 35 188 66 164 M45 222 Q74 215 84 193 M47 209 Q30 196 32 181 M58 184 Q83 181 94 157"/>
      <Path d="M317 245 C332 215 311 192 339 165 M325 216 L348 202 M327 194 L312 179"/>
      <Path d="M95 242 Q96 180 128 166 L160 171 Q180 201 173 244 M110 187 Q119 199 140 208 L185 202 M120 210 L155 230 L181 222"/>
      <Path d="M113 139 C109 117 119 99 137 103 C158 106 158 126 150 141 Q140 159 127 153 Z" fill={c.paper}/>
      <Path d="M113 124 Q121 111 136 113 L151 123 M125 154 L124 169 M143 153 L145 171 M97 239 L169 239"/>
      <Path d="M213 240 Q203 179 228 161 L259 164 Q286 179 288 241 M221 183 L238 204 L207 215 M261 181 L248 214 L209 221" fill={c.paper}/>
      <Path d="M225 132 C214 115 223 96 240 96 C260 96 266 114 256 134 Q242 152 228 141 Z" fill={c.paper}/>
      <Path d="M220 114 Q229 99 252 108 M230 145 L230 164 L242 176 L254 164 L251 145 M242 176 L242 204 M262 180 Q276 188 266 200 M265 198 A5 5 0 1 0 266 198"/>
      <Path d="M177 160 L216 167 L205 206 L168 197 Z" fill={c.bg}/><Path d="M182 171 L206 176 M180 178 L201 183 M177 185 L195 189"/>
      <Path d="M87 245 L293 245 M106 246 L101 278 M278 246 L285 278"/>
      <Circle cx="298" cy="61" r="17"/><Path d="M293 61 L298 66 L307 54 M274 84 Q262 76 267 62 M323 72 L335 76 M296 29 L296 19"/>
      <Path d="M63 86 C92 35 161 31 192 65" strokeDasharray="3 6"/><Circle cx="63" cy="86" r="5" fill={c.cobalt}/>
      <Circle cx="186" cy="56" r="3"/><Circle cx="87" cy="53" r="3"/><Path d="M170 92 L184 92 M177 85 L177 99"/>
    </G>
  </Svg>;
}
export function NotebookArt() {
  return <Svg width="100%" height={120} viewBox="0 0 340 130" accessible={false}>
    <Path d="M0 109 Q80 38 170 86 T340 67" stroke={c.line} strokeWidth="1" fill="none"/>
    <G transform="translate(130 6) rotate(8)" stroke={c.cobalt} strokeWidth="1.5" fill={c.paper}>
      <Rect x="0" y="0" width="83" height="103" rx="3"/><Line x1="13" y1="0" x2="13" y2="103"/>
      <Path d="M26 27 L66 27 M26 36 L59 36 M26 55 L67 55 M26 65 L56 65 M26 75 L63 75"/>
      <Path d="M-4 18 L7 18 M-4 38 L7 38 M-4 58 L7 58 M-4 78 L7 78"/>
    </G><Circle cx="231" cy="87" r="18" fill={c.sage}/><Path d="M224 87 L229 92 L239 81" fill="none" stroke={c.cobalt} strokeWidth="2"/>
  </Svg>;
}
