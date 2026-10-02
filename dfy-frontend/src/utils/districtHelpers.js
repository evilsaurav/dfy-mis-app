export const CANONICAL_DISTRICT_MAP = {
  'aurangabad-bi': 'Aurangabad',
  'aurangabad bi': 'Aurangabad',
  'aurangabad': 'Aurangabad',
  'bhojpur': 'Bhojpur',
  'purba champaran': 'East Champaran',
  'purbi champaran': 'East Champaran',
  'east champaran': 'East Champaran',
  'motihari': 'East Champaran',
};

export const DEFAULT_BIHAR_DISTRICTS = [
  "Aurangabad", "Begusarai", "Bhojpur", "Buxar", "Darbhanga",
  "East Champaran", "Gaya", "Jamui", "Jehanabad", "Kaimur",
  "Khagaria", "Lakhisarai", "Madhubani", "Munger", "Muzaffarpur",
  "Nawada", "Rohtas", "Samastipur", "Sheikhpura", "Sheohar",
  "Sitamarhi", "Vaishali"
];

export const canonicalizeDistrict = (d) => {
  if (!d) return '';
  const clean = String(d).trim();
  return CANONICAL_DISTRICT_MAP[clean.toLowerCase()] || clean;
};

export const canonicalizeFo = (foName, district = '', directory = null) => {
  if (!foName) return '';
  const clean = String(foName).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const cDist = canonicalizeDistrict(district);
  
  if (directory && typeof directory === 'object') {
    if (cDist && Array.isArray(directory[cDist])) {
      const match = directory[cDist].find(official => official && official.trim().toLowerCase() === clean.toLowerCase());
      if (match) return match.trim();
    }
    for (const dist in directory) {
      if (Array.isArray(directory[dist])) {
        const match = directory[dist].find(official => official && official.trim().toLowerCase() === clean.toLowerCase());
        if (match) return match.trim();
      }
    }
  }
  return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

export const normalizeStaffKey = (dist, name) => {
  const d = canonicalizeDistrict(dist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
  return `${d}_${n}`;
};

export const isOfficerNameMatch = (nameA, nameB, dist = '') => {
  if (!nameA || !nameB) return false;
  const a = String(nameA).trim().toLowerCase();
  const b = String(nameB).trim().toLowerCase();
  if (a === b) return true;
  // Proven legacy alias: Ashwani Kumar <-> Ashwani Kr Keshri (Bhojpur)
  if ((a === 'ashwani kumar' || a === 'ashwani kr keshri') && (b === 'ashwani kumar' || b === 'ashwani kr keshri')) return true;
  // Targeted alias: Vinay Prakash <-> Vinay Kumar / Vinay Kumar LT (Muzaffarpur LT)
  const cDist = canonicalizeDistrict(dist || '').toLowerCase();
  if (!dist || cDist === 'muzaffarpur') {
    if ((a === 'vinay prakash' || a === 'vinay kumar' || a === 'vinay kumar lt') &&
        (b === 'vinay prakash' || b === 'vinay kumar' || b === 'vinay kumar lt')) {
      return true;
    }
  }
  return false;
};

export const parseTargetVal = (tObj, fallback = 50) => {
  if (!tObj || tObj.target === undefined || tObj.target === null || tObj.target === '') return fallback;
  const num = Number(tObj.target);
  return isNaN(num) ? fallback : num;
};

export const feedCategoriesConfig = [
  { key: 'notification_ids', label: 'Notification (TB Diagnosis)', isPrimary: true, icon: '📋' },
  { key: 'hiv_dm_ids', label: 'HIV & DM Screening', isPrimary: true, icon: '🩸' },
  { key: 'dbt_ids', label: 'DBT (Bank Seeding)', isPrimary: true, icon: '💰' },
  { key: 'sample_tested_ids', label: 'Sample Tested', isPrimary: true, icon: '🔬' },
  { key: 'sample_collection_ids', label: 'Sample Collection', isPrimary: true, icon: '🧪' },
  { key: 'contact_tracing_ids', label: 'Contact Tracing', isPrimary: true, icon: '👥' },
  { key: 'differentiated_tb_ids', label: 'Diff TB Care', isPrimary: true, icon: '🏥' },
  { key: 'outcome_assigned_ids', label: 'Treatment Outcome', isPrimary: true, icon: '🎯' },
  { key: 'home_visit_ids', label: 'Home Visit', isPrimary: false, icon: '🏠' },
  { key: 'follow_up_ids', label: 'Follow Up', isPrimary: false, icon: '🔄' },
  { key: 'face_to_face_ids', label: 'Face to Face', isPrimary: false, icon: '🗣️' },
  { key: 'presumptive_ids', label: 'Presumptive TB', isPrimary: false, icon: '🩺' },
  { key: 'documents_ids', label: 'Documents Collected', isPrimary: false, icon: '📁' },
  { key: 'fdc_provided_ids', label: 'FDC Provided', isPrimary: false, icon: '💊' },
  { key: 'kit_consumption_ids', label: 'Kit Consumption', isPrimary: false, icon: '📦' },
  { key: 'tpt_treatment_start_ids', label: 'TPT Treatment Start', isPrimary: false, icon: '🛡️' },
  { key: 'tpt_presumptive_ids', label: 'TPT Presumptive', isPrimary: false, icon: '🔍' },
  { key: 'adhar_face_authentication_ids', label: 'Aadhaar Face Auth', isPrimary: false, icon: '👤' },
  { key: 'consent_with_id_ids', label: 'Consent with ID', isPrimary: false, icon: '📝' },
  { key: 'culture_dst_ids', label: 'Culture & DST', isPrimary: false, icon: '🧫' }
];

export const formatAuditTimestamp = (ts, tsFormatted) => {
  if (tsFormatted && (tsFormatted.includes('AM') || tsFormatted.includes('PM'))) {
    return tsFormatted;
  }
  if (!ts) return '—';
  if (typeof ts === 'string' && (ts.includes('AM') || ts.includes('PM'))) {
    return ts;
  }
  try {
    const cleanTs = String(ts).trim();
    let d;
    if (cleanTs.includes('T') || cleanTs.endsWith('Z')) {
      d = new Date(cleanTs);
    } else {
      const isoStr = cleanTs.replace(' ', 'T') + 'Z';
      d = new Date(isoStr);
    }
    if (isNaN(d.getTime())) d = new Date(cleanTs);
    if (isNaN(d.getTime())) return cleanTs;
    
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    });
  } catch (e) {
    return String(ts);
  }
};

export const TOP_PERFORMER_MESSAGES = [
  "🌟 Bihar TB Warriors: Aapka asadharan samarpan aur kadi mehnat Bihar ko TB-mukt banane ki disha me ek nayi kranti la rahi hai!",
  "🔥 Salute to Real Heroes: Har ek notification, home visit aur diagnostic test se kisi pariwar ki zindagi sawar rahi hai. Shandar pradarshan!",
  "🏆 Pride of Doctors For You: Aapki nishtha aur zameeni karyashaili poore Bihar ke sabhi swasthya karmio ke liye prernasrot hai!",
  "🚀 Champions of Frontline Care: Zameen par utarkar har marij tak pahuchna hi sacche seva-bhav ki pehchan hai. Bahut-bahut badhaai!",
  "👏 Exemplary Healthcare Leadership: Aapke atoot sankalp aur parishram ne naye kirtiman sthapit kiye hain. We are immensely proud of you!",
  "💎 Pillars of TB Eradication: Har din naye utsah aur zimmedari ke sath har ek marij tak dava aur dekhbhal pahunchana hi aapki asali taqat hai!",
  "🎯 Mission TB-Free Bihar: Zila star se lekar block tak aapka pradarshan misaal ban chuka hai. Isi josh aur lagan ke sath aage badhte rahein!",
  "🌈 Excellence in Public Health: Aapka yogdan na keval pradarshan me sarvochha hai, balki hazaron pariwaron me nayi umeed jaga raha hai!"
];

