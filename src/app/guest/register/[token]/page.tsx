'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import { de, enUS } from 'date-fns/locale'
import { CheckCircle2, Loader2, AlertTriangle, XCircle, Plus, Trash2, Globe, PenLine } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { translations, type Locale } from '@/lib/i18n/guest-registration'

interface BookingData {
  firstname: string
  lastname: string
  nationality: string
  street: string
  city: string
  zip: string
  country: string
  language: string
  check_in: string
  check_out: string
  adults: number
  children: number
  trip_purpose: string
}

interface PropertyData {
  name: string
  street: string
  city: string
  zip: string
}

interface ExistingForm {
  firstname: string
  lastname: string
  birthdate: string
  nationality: string
  street: string
  city: string
  zip: string
  country: string
  trip_purpose: string
  co_travellers: CoTraveller[]
}

interface CoTraveller {
  firstname: string
  lastname: string
  birthdate?: string
  nationality?: string
}

type PageState = 'loading' | 'form' | 'success' | 'expired' | 'invalid' | 'error'

// Countries with priority countries on top (nearby/common)
const PRIORITY_COUNTRIES = [
  { code: 'DE', de: 'Deutschland', en: 'Germany' },
  { code: 'AT', de: 'Österreich', en: 'Austria' },
  { code: 'CH', de: 'Schweiz', en: 'Switzerland' },
  { code: 'CZ', de: 'Tschechien', en: 'Czech Republic' },
  { code: 'PL', de: 'Polen', en: 'Poland' },
  { code: 'NL', de: 'Niederlande', en: 'Netherlands' },
  { code: 'DK', de: 'Dänemark', en: 'Denmark' },
  { code: 'FR', de: 'Frankreich', en: 'France' },
  { code: 'BE', de: 'Belgien', en: 'Belgium' },
  { code: 'LU', de: 'Luxemburg', en: 'Luxembourg' },
]

// ISO 3166-1 alpha-2, sortiert nach Code, ohne die 10 PRIORITY_COUNTRIES (DE, AT, CH, CZ, PL, NL, DK, FR, BE, LU)
const OTHER_COUNTRIES = [
  { code: 'AD', de: 'Andorra', en: 'Andorra' },
  { code: 'AE', de: 'Vereinigte Arabische Emirate', en: 'United Arab Emirates' },
  { code: 'AF', de: 'Afghanistan', en: 'Afghanistan' },
  { code: 'AG', de: 'Antigua und Barbuda', en: 'Antigua and Barbuda' },
  { code: 'AI', de: 'Anguilla', en: 'Anguilla' },
  { code: 'AL', de: 'Albanien', en: 'Albania' },
  { code: 'AM', de: 'Armenien', en: 'Armenia' },
  { code: 'AO', de: 'Angola', en: 'Angola' },
  { code: 'AQ', de: 'Antarktis', en: 'Antarctica' },
  { code: 'AR', de: 'Argentinien', en: 'Argentina' },
  { code: 'AS', de: 'Amerikanisch-Samoa', en: 'American Samoa' },
  { code: 'AU', de: 'Australien', en: 'Australia' },
  { code: 'AW', de: 'Aruba', en: 'Aruba' },
  { code: 'AX', de: 'Ålandinseln', en: 'Åland Islands' },
  { code: 'AZ', de: 'Aserbaidschan', en: 'Azerbaijan' },
  { code: 'BA', de: 'Bosnien und Herzegowina', en: 'Bosnia and Herzegovina' },
  { code: 'BB', de: 'Barbados', en: 'Barbados' },
  { code: 'BD', de: 'Bangladesch', en: 'Bangladesh' },
  { code: 'BF', de: 'Burkina Faso', en: 'Burkina Faso' },
  { code: 'BG', de: 'Bulgarien', en: 'Bulgaria' },
  { code: 'BH', de: 'Bahrain', en: 'Bahrain' },
  { code: 'BI', de: 'Burundi', en: 'Burundi' },
  { code: 'BJ', de: 'Benin', en: 'Benin' },
  { code: 'BL', de: 'Saint-Barthélemy', en: 'Saint Barthélemy' },
  { code: 'BM', de: 'Bermuda', en: 'Bermuda' },
  { code: 'BN', de: 'Brunei', en: 'Brunei' },
  { code: 'BO', de: 'Bolivien', en: 'Bolivia' },
  { code: 'BQ', de: 'Bonaire, Sint Eustatius und Saba', en: 'Bonaire, Sint Eustatius and Saba' },
  { code: 'BR', de: 'Brasilien', en: 'Brazil' },
  { code: 'BS', de: 'Bahamas', en: 'Bahamas' },
  { code: 'BT', de: 'Bhutan', en: 'Bhutan' },
  { code: 'BV', de: 'Bouvetinsel', en: 'Bouvet Island' },
  { code: 'BW', de: 'Botsuana', en: 'Botswana' },
  { code: 'BY', de: 'Belarus', en: 'Belarus' },
  { code: 'BZ', de: 'Belize', en: 'Belize' },
  { code: 'CA', de: 'Kanada', en: 'Canada' },
  { code: 'CC', de: 'Kokosinseln', en: 'Cocos (Keeling) Islands' },
  { code: 'CD', de: 'Kongo (Demokratische Republik)', en: 'Congo (DRC)' },
  { code: 'CF', de: 'Zentralafrikanische Republik', en: 'Central African Republic' },
  { code: 'CG', de: 'Kongo', en: 'Congo' },
  { code: 'CI', de: 'Elfenbeinküste', en: "Côte d'Ivoire" },
  { code: 'CK', de: 'Cookinseln', en: 'Cook Islands' },
  { code: 'CL', de: 'Chile', en: 'Chile' },
  { code: 'CM', de: 'Kamerun', en: 'Cameroon' },
  { code: 'CN', de: 'China', en: 'China' },
  { code: 'CO', de: 'Kolumbien', en: 'Colombia' },
  { code: 'CR', de: 'Costa Rica', en: 'Costa Rica' },
  { code: 'CU', de: 'Kuba', en: 'Cuba' },
  { code: 'CV', de: 'Kap Verde', en: 'Cape Verde' },
  { code: 'CW', de: 'Curaçao', en: 'Curaçao' },
  { code: 'CX', de: 'Weihnachtsinsel', en: 'Christmas Island' },
  { code: 'CY', de: 'Zypern', en: 'Cyprus' },
  { code: 'DJ', de: 'Dschibuti', en: 'Djibouti' },
  { code: 'DM', de: 'Dominica', en: 'Dominica' },
  { code: 'DO', de: 'Dominikanische Republik', en: 'Dominican Republic' },
  { code: 'DZ', de: 'Algerien', en: 'Algeria' },
  { code: 'EC', de: 'Ecuador', en: 'Ecuador' },
  { code: 'EE', de: 'Estland', en: 'Estonia' },
  { code: 'EG', de: 'Ägypten', en: 'Egypt' },
  { code: 'EH', de: 'Westsahara', en: 'Western Sahara' },
  { code: 'ER', de: 'Eritrea', en: 'Eritrea' },
  { code: 'ES', de: 'Spanien', en: 'Spain' },
  { code: 'ET', de: 'Äthiopien', en: 'Ethiopia' },
  { code: 'FI', de: 'Finnland', en: 'Finland' },
  { code: 'FJ', de: 'Fidschi', en: 'Fiji' },
  { code: 'FK', de: 'Falklandinseln', en: 'Falkland Islands' },
  { code: 'FM', de: 'Mikronesien', en: 'Micronesia' },
  { code: 'FO', de: 'Färöer', en: 'Faroe Islands' },
  { code: 'GA', de: 'Gabun', en: 'Gabon' },
  { code: 'GB', de: 'Vereinigtes Königreich', en: 'United Kingdom' },
  { code: 'GD', de: 'Grenada', en: 'Grenada' },
  { code: 'GE', de: 'Georgien', en: 'Georgia' },
  { code: 'GF', de: 'Französisch-Guayana', en: 'French Guiana' },
  { code: 'GG', de: 'Guernsey', en: 'Guernsey' },
  { code: 'GH', de: 'Ghana', en: 'Ghana' },
  { code: 'GI', de: 'Gibraltar', en: 'Gibraltar' },
  { code: 'GL', de: 'Grönland', en: 'Greenland' },
  { code: 'GM', de: 'Gambia', en: 'Gambia' },
  { code: 'GN', de: 'Guinea', en: 'Guinea' },
  { code: 'GP', de: 'Guadeloupe', en: 'Guadeloupe' },
  { code: 'GQ', de: 'Äquatorialguinea', en: 'Equatorial Guinea' },
  { code: 'GR', de: 'Griechenland', en: 'Greece' },
  { code: 'GS', de: 'Südgeorgien und die Südlichen Sandwichinseln', en: 'South Georgia and the South Sandwich Islands' },
  { code: 'GT', de: 'Guatemala', en: 'Guatemala' },
  { code: 'GU', de: 'Guam', en: 'Guam' },
  { code: 'GW', de: 'Guinea-Bissau', en: 'Guinea-Bissau' },
  { code: 'GY', de: 'Guyana', en: 'Guyana' },
  { code: 'HK', de: 'Hongkong', en: 'Hong Kong' },
  { code: 'HM', de: 'Heard und McDonaldinseln', en: 'Heard Island and McDonald Islands' },
  { code: 'HN', de: 'Honduras', en: 'Honduras' },
  { code: 'HR', de: 'Kroatien', en: 'Croatia' },
  { code: 'HT', de: 'Haiti', en: 'Haiti' },
  { code: 'HU', de: 'Ungarn', en: 'Hungary' },
  { code: 'ID', de: 'Indonesien', en: 'Indonesia' },
  { code: 'IE', de: 'Irland', en: 'Ireland' },
  { code: 'IL', de: 'Israel', en: 'Israel' },
  { code: 'IM', de: 'Insel Man', en: 'Isle of Man' },
  { code: 'IN', de: 'Indien', en: 'India' },
  { code: 'IO', de: 'Britisches Territorium im Indischen Ozean', en: 'British Indian Ocean Territory' },
  { code: 'IQ', de: 'Irak', en: 'Iraq' },
  { code: 'IR', de: 'Iran', en: 'Iran' },
  { code: 'IS', de: 'Island', en: 'Iceland' },
  { code: 'IT', de: 'Italien', en: 'Italy' },
  { code: 'JE', de: 'Jersey', en: 'Jersey' },
  { code: 'JM', de: 'Jamaika', en: 'Jamaica' },
  { code: 'JO', de: 'Jordanien', en: 'Jordan' },
  { code: 'JP', de: 'Japan', en: 'Japan' },
  { code: 'KE', de: 'Kenia', en: 'Kenya' },
  { code: 'KG', de: 'Kirgisistan', en: 'Kyrgyzstan' },
  { code: 'KH', de: 'Kambodscha', en: 'Cambodia' },
  { code: 'KI', de: 'Kiribati', en: 'Kiribati' },
  { code: 'KM', de: 'Komoren', en: 'Comoros' },
  { code: 'KN', de: 'St. Kitts und Nevis', en: 'Saint Kitts and Nevis' },
  { code: 'KP', de: 'Nordkorea', en: 'North Korea' },
  { code: 'KR', de: 'Südkorea', en: 'South Korea' },
  { code: 'KW', de: 'Kuwait', en: 'Kuwait' },
  { code: 'KY', de: 'Kaimaninseln', en: 'Cayman Islands' },
  { code: 'KZ', de: 'Kasachstan', en: 'Kazakhstan' },
  { code: 'LA', de: 'Laos', en: 'Laos' },
  { code: 'LB', de: 'Libanon', en: 'Lebanon' },
  { code: 'LC', de: 'St. Lucia', en: 'Saint Lucia' },
  { code: 'LI', de: 'Liechtenstein', en: 'Liechtenstein' },
  { code: 'LK', de: 'Sri Lanka', en: 'Sri Lanka' },
  { code: 'LR', de: 'Liberia', en: 'Liberia' },
  { code: 'LS', de: 'Lesotho', en: 'Lesotho' },
  { code: 'LT', de: 'Litauen', en: 'Lithuania' },
  { code: 'LV', de: 'Lettland', en: 'Latvia' },
  { code: 'LY', de: 'Libyen', en: 'Libya' },
  { code: 'MA', de: 'Marokko', en: 'Morocco' },
  { code: 'MC', de: 'Monaco', en: 'Monaco' },
  { code: 'MD', de: 'Moldau', en: 'Moldova' },
  { code: 'ME', de: 'Montenegro', en: 'Montenegro' },
  { code: 'MF', de: 'Saint-Martin (französischer Teil)', en: 'Saint Martin (French part)' },
  { code: 'MG', de: 'Madagaskar', en: 'Madagascar' },
  { code: 'MH', de: 'Marshallinseln', en: 'Marshall Islands' },
  { code: 'MK', de: 'Nordmazedonien', en: 'North Macedonia' },
  { code: 'ML', de: 'Mali', en: 'Mali' },
  { code: 'MM', de: 'Myanmar', en: 'Myanmar' },
  { code: 'MN', de: 'Mongolei', en: 'Mongolia' },
  { code: 'MO', de: 'Macau', en: 'Macao' },
  { code: 'MP', de: 'Nördliche Marianen', en: 'Northern Mariana Islands' },
  { code: 'MQ', de: 'Martinique', en: 'Martinique' },
  { code: 'MR', de: 'Mauretanien', en: 'Mauritania' },
  { code: 'MS', de: 'Montserrat', en: 'Montserrat' },
  { code: 'MT', de: 'Malta', en: 'Malta' },
  { code: 'MU', de: 'Mauritius', en: 'Mauritius' },
  { code: 'MV', de: 'Malediven', en: 'Maldives' },
  { code: 'MW', de: 'Malawi', en: 'Malawi' },
  { code: 'MX', de: 'Mexiko', en: 'Mexico' },
  { code: 'MY', de: 'Malaysia', en: 'Malaysia' },
  { code: 'MZ', de: 'Mosambik', en: 'Mozambique' },
  { code: 'NA', de: 'Namibia', en: 'Namibia' },
  { code: 'NC', de: 'Neukaledonien', en: 'New Caledonia' },
  { code: 'NE', de: 'Niger', en: 'Niger' },
  { code: 'NF', de: 'Norfolkinsel', en: 'Norfolk Island' },
  { code: 'NG', de: 'Nigeria', en: 'Nigeria' },
  { code: 'NI', de: 'Nicaragua', en: 'Nicaragua' },
  { code: 'NO', de: 'Norwegen', en: 'Norway' },
  { code: 'NP', de: 'Nepal', en: 'Nepal' },
  { code: 'NR', de: 'Nauru', en: 'Nauru' },
  { code: 'NU', de: 'Niue', en: 'Niue' },
  { code: 'NZ', de: 'Neuseeland', en: 'New Zealand' },
  { code: 'OM', de: 'Oman', en: 'Oman' },
  { code: 'PA', de: 'Panama', en: 'Panama' },
  { code: 'PE', de: 'Peru', en: 'Peru' },
  { code: 'PF', de: 'Französisch-Polynesien', en: 'French Polynesia' },
  { code: 'PG', de: 'Papua-Neuguinea', en: 'Papua New Guinea' },
  { code: 'PH', de: 'Philippinen', en: 'Philippines' },
  { code: 'PK', de: 'Pakistan', en: 'Pakistan' },
  { code: 'PM', de: 'St. Pierre und Miquelon', en: 'Saint Pierre and Miquelon' },
  { code: 'PN', de: 'Pitcairninseln', en: 'Pitcairn Islands' },
  { code: 'PR', de: 'Puerto Rico', en: 'Puerto Rico' },
  { code: 'PS', de: 'Palästina', en: 'Palestine' },
  { code: 'PT', de: 'Portugal', en: 'Portugal' },
  { code: 'PW', de: 'Palau', en: 'Palau' },
  { code: 'PY', de: 'Paraguay', en: 'Paraguay' },
  { code: 'QA', de: 'Katar', en: 'Qatar' },
  { code: 'RE', de: 'Réunion', en: 'Réunion' },
  { code: 'RO', de: 'Rumänien', en: 'Romania' },
  { code: 'RS', de: 'Serbien', en: 'Serbia' },
  { code: 'RU', de: 'Russland', en: 'Russia' },
  { code: 'RW', de: 'Ruanda', en: 'Rwanda' },
  { code: 'SA', de: 'Saudi-Arabien', en: 'Saudi Arabia' },
  { code: 'SB', de: 'Salomonen', en: 'Solomon Islands' },
  { code: 'SC', de: 'Seychellen', en: 'Seychelles' },
  { code: 'SD', de: 'Sudan', en: 'Sudan' },
  { code: 'SE', de: 'Schweden', en: 'Sweden' },
  { code: 'SG', de: 'Singapur', en: 'Singapore' },
  { code: 'SH', de: 'St. Helena', en: 'Saint Helena' },
  { code: 'SI', de: 'Slowenien', en: 'Slovenia' },
  { code: 'SJ', de: 'Svalbard und Jan Mayen', en: 'Svalbard and Jan Mayen' },
  { code: 'SK', de: 'Slowakei', en: 'Slovakia' },
  { code: 'SL', de: 'Sierra Leone', en: 'Sierra Leone' },
  { code: 'SM', de: 'San Marino', en: 'San Marino' },
  { code: 'SN', de: 'Senegal', en: 'Senegal' },
  { code: 'SO', de: 'Somalia', en: 'Somalia' },
  { code: 'SR', de: 'Suriname', en: 'Suriname' },
  { code: 'SS', de: 'Südsudan', en: 'South Sudan' },
  { code: 'ST', de: 'São Tomé und Príncipe', en: 'Sao Tome and Principe' },
  { code: 'SV', de: 'El Salvador', en: 'El Salvador' },
  { code: 'SX', de: 'Sint Maarten', en: 'Sint Maarten' },
  { code: 'SY', de: 'Syrien', en: 'Syria' },
  { code: 'SZ', de: 'Eswatini', en: 'Eswatini' },
  { code: 'TC', de: 'Turks- und Caicosinseln', en: 'Turks and Caicos Islands' },
  { code: 'TD', de: 'Tschad', en: 'Chad' },
  { code: 'TF', de: 'Französische Süd- und Antarktisgebiete', en: 'French Southern Territories' },
  { code: 'TG', de: 'Togo', en: 'Togo' },
  { code: 'TH', de: 'Thailand', en: 'Thailand' },
  { code: 'TJ', de: 'Tadschikistan', en: 'Tajikistan' },
  { code: 'TK', de: 'Tokelau', en: 'Tokelau' },
  { code: 'TL', de: 'Timor-Leste', en: 'Timor-Leste' },
  { code: 'TM', de: 'Turkmenistan', en: 'Turkmenistan' },
  { code: 'TN', de: 'Tunesien', en: 'Tunisia' },
  { code: 'TO', de: 'Tonga', en: 'Tonga' },
  { code: 'TR', de: 'Türkei', en: 'Turkey' },
  { code: 'TT', de: 'Trinidad und Tobago', en: 'Trinidad and Tobago' },
  { code: 'TV', de: 'Tuvalu', en: 'Tuvalu' },
  { code: 'TW', de: 'Taiwan', en: 'Taiwan' },
  { code: 'TZ', de: 'Tansania', en: 'Tanzania' },
  { code: 'UA', de: 'Ukraine', en: 'Ukraine' },
  { code: 'UG', de: 'Uganda', en: 'Uganda' },
  { code: 'UM', de: 'Amerikanische Überseeinseln', en: 'U.S. Minor Outlying Islands' },
  { code: 'US', de: 'Vereinigte Staaten', en: 'United States' },
  { code: 'UY', de: 'Uruguay', en: 'Uruguay' },
  { code: 'UZ', de: 'Usbekistan', en: 'Uzbekistan' },
  { code: 'VA', de: 'Vatikanstadt', en: 'Vatican City' },
  { code: 'VC', de: 'St. Vincent und die Grenadinen', en: 'Saint Vincent and the Grenadines' },
  { code: 'VE', de: 'Venezuela', en: 'Venezuela' },
  { code: 'VG', de: 'Britische Jungferninseln', en: 'British Virgin Islands' },
  { code: 'VI', de: 'Amerikanische Jungferninseln', en: 'U.S. Virgin Islands' },
  { code: 'VN', de: 'Vietnam', en: 'Vietnam' },
  { code: 'VU', de: 'Vanuatu', en: 'Vanuatu' },
  { code: 'WF', de: 'Wallis und Futuna', en: 'Wallis and Futuna' },
  { code: 'WS', de: 'Samoa', en: 'Samoa' },
  { code: 'YE', de: 'Jemen', en: 'Yemen' },
  { code: 'YT', de: 'Mayotte', en: 'Mayotte' },
  { code: 'ZA', de: 'Südafrika', en: 'South Africa' },
  { code: 'ZM', de: 'Sambia', en: 'Zambia' },
  { code: 'ZW', de: 'Simbabwe', en: 'Zimbabwe' },
]

function GuestSignatureCanvas({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, h - 20)
    ctx.lineTo(w - 20, h - 20)
    ctx.stroke()
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    setIsDrawing(true)
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!isDrawing) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  function stop() {
    if (!isDrawing) return
    setIsDrawing(false)
    setHasSignature(true)
    if (canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, h - 20)
    ctx.lineTo(w - 20, h - 20)
    ctx.stroke()
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.restore()
    setHasSignature(false)
    onChange(null)
  }

  return (
    <div>
      <div className="rounded-md border border-input bg-white">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair touch-none rounded-md"
          style={{ height: 120 }}
          onMouseDown={start}
          onMouseMove={draw}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={start}
          onTouchMove={draw}
          onTouchEnd={stop}
        />
      </div>
      {hasSignature && (
        <Button type="button" variant="ghost" size="sm" onClick={clear} className="mt-1">
          <PenLine className="h-3 w-3 mr-1" />
          {/* Simple clear label - no translation needed for icon button */}
          ✕
        </Button>
      )}
    </div>
  )
}

export default function GuestRegistrationPage() {
  const { token } = useParams<{ token: string }>()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [booking, setBooking] = useState<BookingData | null>(null)
  const [property, setProperty] = useState<PropertyData | null>(null)
  const [existingForm, setExistingForm] = useState<ExistingForm | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [firstname, setFirstname] = useState('')
  const [lastname, setLastname] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [nationality, setNationality] = useState('')
  const [street, setStreet] = useState('')
  const [zip, setZip] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [tripPurpose, setTripPurpose] = useState('unknown')
  const [idScanFile, setIdScanFile] = useState<File | null>(null)

  // Compress image to stay under Vercel's 4.5 MB body limit
  async function compressImage(file: File, maxSizeKB = 900): Promise<File> {
    if (file.size <= maxSizeKB * 1024) return file
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        // Scale down if very large
        const maxDim = 1600
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            resolve(new File([blob!], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
          },
          'image/jpeg',
          0.7
        )
      }
      img.src = URL.createObjectURL(file)
    })
  }
  const [signature, setSignature] = useState<string | null>(null)
  const [coTravellers, setCoTravellers] = useState<CoTraveller[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Language
  const [locale, setLocale] = useState<Locale>('de')
  const t = translations[locale]

  // Load booking data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/guest-registration/${token}`)
        if (res.status === 410) { setPageState('expired'); return }
        if (res.status === 404) { setPageState('invalid'); return }
        if (!res.ok) { setPageState('error'); return }

        const data = await res.json()
        setBooking(data.booking)
        setProperty(data.property)
        if (data.logo_url) setLogoUrl(data.logo_url)

        // Determine locale from guest language
        const lang = data.booking?.language?.toLowerCase() ?? 'de'
        if (lang.startsWith('en')) setLocale('en')

        // Pre-fill from existing form (re-submission) or from booking
        const source = data.existingForm ?? data.booking
        setFirstname(source.firstname ?? '')
        setLastname(source.lastname ?? '')
        setNationality(source.nationality ?? '')
        setStreet(source.street ?? '')
        setCity(source.city ?? '')
        setZip(source.zip ?? '')
        setCountry(source.country ?? '')
        setTripPurpose(source.trip_purpose ?? 'unknown')

        if (data.existingForm) {
          setExistingForm(data.existingForm)
          setBirthdate(data.existingForm.birthdate ?? '')
          setCoTravellers(data.existingForm.co_travellers ?? [])
        }

        setPageState('form')
      } catch {
        setPageState('error')
      }
    }
    load()
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validate ID scan for non-German guests
    if (nationality && nationality !== 'DE' && !idScanFile) {
      return
    }
    // Validate signature is present
    if (!signature) {
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    // Client-Timeout: verhindert Endlos-Spinner, falls Server/Netzwerk klemmt.
    // 60 s ist reichlich (SmoobuClient hat 15 s, Auto-Message-Race 25 s serverseitig).
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60_000)

    try {
      const formPayload = new FormData()
      formPayload.append('data', JSON.stringify({
        firstname,
        lastname,
        birthdate: birthdate || undefined,
        nationality: nationality || undefined,
        street: street || undefined,
        zip: zip || undefined,
        city: city || undefined,
        country: country || undefined,
        trip_purpose: tripPurpose,
        signature: signature || undefined,
        co_travellers: coTravellers.filter(ct => ct.firstname && ct.lastname),
      }))
      if (idScanFile) {
        const compressed = await compressImage(idScanFile)
        formPayload.append('idScan', compressed)
      }

      const res = await fetch(`/api/guest-registration/${token}`, {
        method: 'POST',
        body: formPayload,
        signal: controller.signal,
      })

      if (res.ok) {
        setPageState('success')
      } else {
        setPageState('error')
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      if (isAbort) {
        // Bleibt auf der Form-Seite, damit der Gast nach einem Retry nicht alles neu tippen muss.
        setSubmitError(
          locale === 'de'
            ? 'Der Check-in dauert gerade länger als gewöhnlich. Bitte in ein paar Sekunden erneut probieren – deine Eingaben bleiben erhalten.'
            : 'The check-in is taking longer than usual. Please try again in a few seconds – your entries are preserved.',
        )
      } else {
        setPageState('error')
      }
    } finally {
      clearTimeout(timeoutId)
      setSubmitting(false)
    }
  }

  function addCoTraveller() {
    setCoTravellers([...coTravellers, { firstname: '', lastname: '', birthdate: '', nationality: '' }])
  }

  function removeCoTraveller(index: number) {
    setCoTravellers(coTravellers.filter((_, i) => i !== index))
  }

  function updateCoTraveller(index: number, field: keyof CoTraveller, value: string) {
    const updated = [...coTravellers]
    updated[index] = { ...updated[index], [field]: value }
    setCoTravellers(updated)
  }

  function formatDate(dateStr: string) {
    try {
      return format(new Date(dateStr), 'dd.MM.yyyy', { locale: locale === 'de' ? de : enUS })
    } catch {
      return dateStr
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  // ─── Expired ────────────────────────────────────────────────────────────────
  if (pageState === 'expired') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <h2 className="text-xl font-semibold">{t.expiredTitle}</h2>
          <p className="text-muted-foreground">{t.expiredMessage}</p>
        </CardContent>
      </Card>
    )
  }

  // ─── Invalid ────────────────────────────────────────────────────────────────
  if (pageState === 'invalid') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <XCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">{t.invalidTitle}</h2>
          <p className="text-muted-foreground">{t.invalidMessage}</p>
        </CardContent>
      </Card>
    )
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <XCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">{t.errorTitle}</h2>
          <p className="text-muted-foreground">{t.errorMessage}</p>
        </CardContent>
      </Card>
    )
  }

  // ─── Success ────────────────────────────────────────────────────────────────
  if (pageState === 'success') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          <h2 className="text-2xl font-semibold">{t.successTitle}</h2>
          <p className="text-muted-foreground max-w-sm">{t.successMessage}</p>
          {property && booking && (
            <div className="mt-4 rounded-lg border bg-muted/50 p-4 text-left w-full max-w-sm space-y-2">
              <p className="text-sm font-medium">{t.checkInInfoTitle}</p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>{t.propertyLabel}: <span className="font-medium text-foreground">{property.name}</span></p>
                <p>{t.checkIn}: <span className="font-medium text-foreground">{formatDate(booking.check_in)}</span></p>
                {property.street && (
                  <p>{locale === 'de' ? 'Adresse' : 'Address'}: <span className="font-medium text-foreground">{property.street}, {property.zip} {property.city}</span></p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">{t.checkInInfoNote}</p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ─── Form ───────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit}>
      {/* Header with property info + language toggle */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          {logoUrl && (
            <div className="flex justify-center mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo"
                className="h-16 max-w-[200px] object-contain"
              />
            </div>
          )}
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{t.title}</CardTitle>
              <CardDescription className="mt-1">{t.subtitle}</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLocale(l => l === 'de' ? 'en' : 'de')}
              className="shrink-0"
            >
              <Globe className="h-4 w-4 mr-1" />
              {locale === 'de' ? 'EN' : 'DE'}
            </Button>
          </div>
        </CardHeader>
        {property && booking && (
          <CardContent className="pt-0">
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">{t.propertyLabel}:</span>{' '}
                {property.name}
              </div>
              <div>
                <span className="font-medium text-foreground">{t.stayPeriod}:</span>{' '}
                {formatDate(booking.check_in)} – {formatDate(booking.check_out)}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Existing form notice */}
      {existingForm && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t.alreadySubmitted}
        </div>
      )}

      {/* Guest data form */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground mb-4">{t.legalNote}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* First name */}
            <div className="space-y-2">
              <Label htmlFor="firstname">
                {t.firstname} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstname"
                value={firstname}
                onChange={e => setFirstname(e.target.value)}
                required
              />
            </div>

            {/* Last name */}
            <div className="space-y-2">
              <Label htmlFor="lastname">
                {t.lastname} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastname"
                value={lastname}
                onChange={e => setLastname(e.target.value)}
                required
              />
            </div>

            {/* Birthdate */}
            <div className="space-y-2">
              <Label htmlFor="birthdate">{t.birthdate}</Label>
              <Input
                id="birthdate"
                type="date"
                value={birthdate}
                onChange={e => setBirthdate(e.target.value)}
              />
            </div>

            {/* Nationality */}
            <div className="space-y-2">
              <Label htmlFor="nationality">
                {t.nationality} <span className="text-destructive">*</span>
              </Label>
              <Select value={nationality} onValueChange={setNationality} required>
                <SelectTrigger>
                  <SelectValue placeholder={locale === 'de' ? 'Bitte wählen...' : 'Please select...'} />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_COUNTRIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{locale === 'de' ? c.de : c.en}</SelectItem>
                  ))}
                  <SelectItem disabled value="__sep1__">───────────</SelectItem>
                  {OTHER_COUNTRIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{locale === 'de' ? c.de : c.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Street */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="street">
                {t.street} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="street"
                value={street}
                onChange={e => setStreet(e.target.value)}
                required
              />
            </div>

            {/* ZIP */}
            <div className="space-y-2">
              <Label htmlFor="zip">{t.zip} <span className="text-destructive">*</span></Label>
              <Input
                id="zip"
                value={zip}
                onChange={e => setZip(e.target.value)}
                required
              />
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label htmlFor="city">{t.city} <span className="text-destructive">*</span></Label>
              <Input
                id="city"
                value={city}
                onChange={e => setCity(e.target.value)}
                required
              />
            </div>

            {/* Country */}
            <div className="space-y-2">
              <Label htmlFor="country">{t.country} <span className="text-destructive">*</span></Label>
              <Select value={country} onValueChange={setCountry} required>
                <SelectTrigger>
                  <SelectValue placeholder={locale === 'de' ? 'Bitte wählen...' : 'Please select...'} />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_COUNTRIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{locale === 'de' ? c.de : c.en}</SelectItem>
                  ))}
                  <SelectItem disabled value="__sep2__">───────────</SelectItem>
                  {OTHER_COUNTRIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{locale === 'de' ? c.de : c.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ID scan required for non-German guests */}
            {nationality && nationality !== 'DE' && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="idScan">
                  {locale === 'de' ? 'Ausweiskopie / Reisepass' : 'ID / Passport scan'} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="idScan"
                  type="file"
                  accept="image/*,.pdf"
                  required
                  onChange={e => setIdScanFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  {locale === 'de'
                    ? 'Foto oder Scan Ihres Ausweises / Reisepasses (Bild oder PDF).'
                    : 'Photo or scan of your ID / passport (image or PDF).'}
                </p>
              </div>
            )}

            {/* Trip purpose */}
            <div className="space-y-2">
              <Label>{t.tripPurpose}</Label>
              <Select value={tripPurpose} onValueChange={setTripPurpose}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leisure">{t.leisure}</SelectItem>
                  <SelectItem value="business">{t.business}</SelectItem>
                  <SelectItem value="unknown">–</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Co-travellers */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.coTravellers}</CardTitle>
        </CardHeader>
        <CardContent>
          {coTravellers.map((ct, i) => (
            <div key={i} className="mb-4">
              {i > 0 && <Separator className="mb-4" />}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t.firstname}</Label>
                  <Input
                    value={ct.firstname}
                    onChange={e => updateCoTraveller(i, 'firstname', e.target.value)}
                    placeholder={t.firstname}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t.lastname}</Label>
                  <Input
                    value={ct.lastname}
                    onChange={e => updateCoTraveller(i, 'lastname', e.target.value)}
                    placeholder={t.lastname}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t.birthdate}</Label>
                  <Input
                    type="date"
                    value={ct.birthdate ?? ''}
                    onChange={e => updateCoTraveller(i, 'birthdate', e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCoTraveller(i)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    {t.removeCoTraveller}
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addCoTraveller}>
            <Plus className="h-4 w-4 mr-1" />
            {t.addCoTraveller}
          </Button>
        </CardContent>
      </Card>

      {/* Signature */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label>
              {t.signatureLabel} <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">{t.signatureHint}</p>
            <GuestSignatureCanvas onChange={setSignature} />
            {!signature && submitting === false && (
              <p className="text-xs text-destructive sr-only">{t.signatureRequired}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Submit error (Timeout / Netzwerk) */}
      {submitError && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {submitError}
        </div>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full" size="lg" disabled={submitting || !signature}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {t.submitting}
          </>
        ) : (
          t.submit
        )}
      </Button>
    </form>
  )
}
