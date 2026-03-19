// School mapping: Flutter STANDARD/HANAFI → AlAdhan 0/1
const getSchool = (school) => {
  const s = String(school).toUpperCase().trim();
  if (s === '1' || s === 'HANAFI') return 1;
  return 0; // STANDARD = Shafi
};

// Method mapping: Flutter id → AlAdhan method
// Flutter sends id directly (0-23), AlAdhan uses same IDs
const getMethod = (method) => {
  const validMethods = [
    0, 1, 2, 3, 4, 5, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18,
    19, 20, 21, 22, 23,
  ];
  const m = parseInt(method);
  return validMethods.includes(m) ? m : 3; // default MWL
};

// Method name lookup
const getMethodName = (method) => {
  const methods = {
    0:  'Shia Ithna-Ansari (JAFARI)',
    1:  'University of Islamic Sciences, Karachi',
    2:  'Islamic Society of North America (ISNA)',
    3:  'Muslim World League (MWL)',
    4:  'Umm Al-Qura University, Makkah',
    5:  'Egyptian General Authority of Survey',
    7:  'Institute of Geophysics, University of Tehran',
    8:  'Gulf Region',
    9:  'Kuwait',
    10: 'Qatar',
    11: 'Majlis Ugama Islam Singapura, Singapore',
    12: 'Union Organization Islamic de France',
    13: 'Diyanet İşleri Başkanlığı, Turkey',
    14: 'Spiritual Administration of Muslims of Russia',
    15: 'Moonsighting Committee Worldwide',
    16: 'Dubai (experimental)',
    17: 'Jabatan Kemajuan Islam Malaysia (JAKIM)',
    18: 'Tunisia',
    19: 'Algeria',
    20: 'Kementerian Agama Republik Indonesia (Kemenag)',
    21: 'Morocco',
    22: 'Comunidade Islamica de Lisboa (Portugal)',
    23: 'Ministry of Awqaf, Jordan',
  };
  return methods[parseInt(method)] || 'Unknown';
};

module.exports = { getSchool, getMethod, getMethodName };