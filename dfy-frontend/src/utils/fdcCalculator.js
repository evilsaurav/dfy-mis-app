/**
 * TB FDC Medicine Dosage Calculation Engine
 * Conforms strictly to National TB Elimination Program (NTEP) Adult & Pediatric guidelines.
 */

export function calculateFdcDosage(patientType = 'adult', weightKg, phase = 'IP') {
  const weight = parseFloat(weightKg);
  const normalizedPhase = String(phase || 'IP').toUpperCase().trim() === 'CP' ? 'CP' : 'IP';
  const isAdult = patientType !== 'pediatric';

  if (isNaN(weight) || weight <= 0) {
    return {
      isValid: false,
      error: 'Please enter a valid weight in kg.',
      patientType,
      weightKg: null,
      phase: normalizedPhase,
      phaseText: normalizedPhase === 'IP' ? 'Intensive Phase (IP)' : 'Continuation Phase (CP)',
      regimenName: '',
      weightBand: '',
      dailyDoseText: '',
      supplyIssued: '',
      dailyTablets: 0,
      strips: 0
    };
  }

  // 1. Adult Calculation Matrix
  if (isAdult) {
    if (weight < 25) {
      return {
        isValid: false,
        error: 'Adult weight must be at least 25 kg. Please refer to Medical Officer.',
        patientType: 'adult',
        weightKg: weight,
        phase: normalizedPhase,
        phaseText: normalizedPhase === 'IP' ? 'Intensive Phase (IP)' : 'Continuation Phase (CP)',
        regimenName: '',
        weightBand: '< 25 kg',
        dailyDoseText: '',
        supplyIssued: '',
        dailyTablets: 0,
        strips: 0
      };
    }

    let weightBand = '';
    let dailyTablets = 0;
    let strips = 0;

    if (weight < 35) {
      weightBand = '25–34 kg';
      dailyTablets = 2;
      strips = normalizedPhase === 'IP' ? 4 : 8;
    } else if (weight < 50) {
      weightBand = '35–49 kg';
      dailyTablets = 3;
      strips = normalizedPhase === 'IP' ? 6 : 12;
    } else if (weight < 65) {
      weightBand = '50–64 kg';
      dailyTablets = 4;
      strips = normalizedPhase === 'IP' ? 8 : 16;
    } else if (weight <= 75) {
      weightBand = '65–75 kg';
      dailyTablets = 5;
      strips = normalizedPhase === 'IP' ? 10 : 20;
    } else {
      weightBand = '> 75 kg';
      dailyTablets = 6;
      strips = normalizedPhase === 'IP' ? 12 : 24;
    }

    const regimenName = normalizedPhase === 'IP' ? '4 FDC (HRZE)' : '3 FDC (HRE)';
    const dailyDoseText = `${dailyTablets} tabs daily`;
    const supplyIssued = normalizedPhase === 'IP' 
      ? `${strips} strips (28 days)` 
      : `${strips} strips (56 days)`;

    return {
      isValid: true,
      error: null,
      patientType: 'adult',
      weightKg: weight,
      phase: normalizedPhase,
      phaseText: normalizedPhase === 'IP' ? 'Intensive Phase (IP)' : 'Continuation Phase (CP)',
      regimenName,
      weightBand,
      dailyDoseText,
      supplyIssued,
      dailyTablets,
      strips
    };
  }

  // 2. Pediatric Calculation Matrix
  if (weight < 4) {
    return {
      isValid: false,
      error: 'Pediatric weight must be at least 4 kg.',
      patientType: 'pediatric',
      weightKg: weight,
      phase: normalizedPhase,
      phaseText: normalizedPhase === 'IP' ? 'Intensive Phase (IP)' : 'Continuation Phase (CP)',
      regimenName: '',
      weightBand: '< 4 kg',
      dailyDoseText: '',
      supplyIssued: '',
      dailyTablets: 0,
      strips: 0
    };
  }

  if (weight >= 40) {
    // Falls back to adult standard dosing
    const adultResult = calculateFdcDosage('adult', weight, normalizedPhase);
    return {
      ...adultResult,
      patientType: 'pediatric'
    };
  }

  let weightBand = '';
  let regimenName = '';
  let dailyDoseText = '';
  let supplyIssued = '';
  let dailyTablets = 0;
  let strips = 0;

  if (weight < 8) {
    weightBand = '4–7 kg';
    dailyTablets = 2;
    strips = 2;
    if (normalizedPhase === 'IP') {
      regimenName = '1 tab HRZ (3 FDC-P) + 1 tab E (100mg)';
      dailyDoseText = '1 tab HRZ + 1 tab E daily';
      supplyIssued = '1 strip HRZ + 1 strip E (28 days)';
    } else {
      regimenName = '1 tab HR (2 FDC-P) + 1 tab E (100mg)';
      dailyDoseText = '1 tab HR + 1 tab E daily';
      supplyIssued = '1 strip HR + 1 strip E (28 days)';
    }
  } else if (weight < 12) {
    weightBand = '8–11 kg';
    dailyTablets = 4;
    strips = 4;
    if (normalizedPhase === 'IP') {
      regimenName = '2 tabs HRZ (3 FDC-P) + 2 tabs E (100mg)';
      dailyDoseText = '2 tabs HRZ + 2 tabs E daily';
      supplyIssued = '2 strips HRZ + 2 strips E (28 days)';
    } else {
      regimenName = '2 tabs HR (2 FDC-P) + 2 tabs E (100mg)';
      dailyDoseText = '2 tabs HR + 2 tabs E daily';
      supplyIssued = '2 strips HR + 2 strips E (28 days)';
    }
  } else if (weight < 16) {
    weightBand = '12–15 kg';
    dailyTablets = 6;
    strips = 6;
    if (normalizedPhase === 'IP') {
      regimenName = '3 tabs HRZ (3 FDC-P) + 3 tabs E (100mg)';
      dailyDoseText = '3 tabs HRZ + 3 tabs E daily';
      supplyIssued = '3 strips HRZ + 3 strips E (28 days)';
    } else {
      regimenName = '3 tabs HR (2 FDC-P) + 3 tabs E (100mg)';
      dailyDoseText = '3 tabs HR + 3 tabs E daily';
      supplyIssued = '3 strips HR + 3 strips E (28 days)';
    }
  } else if (weight < 25) {
    weightBand = '16–24 kg';
    dailyTablets = 8;
    strips = 8;
    if (normalizedPhase === 'IP') {
      regimenName = '4 tabs HRZ (3 FDC-P) + 4 tabs E (100mg)';
      dailyDoseText = '4 tabs HRZ + 4 tabs E daily';
      supplyIssued = '4 strips HRZ + 4 strips E (28 days)';
    } else {
      regimenName = '4 tabs HR (2 FDC-P) + 4 tabs E (100mg)';
      dailyDoseText = '4 tabs HR + 4 tabs E daily';
      supplyIssued = '4 strips HR + 4 strips E (28 days)';
    }
  } else if (weight < 30) {
    weightBand = '25–29 kg';
    dailyTablets = 7;
    strips = 7;
    if (normalizedPhase === 'IP') {
      regimenName = '3 tabs (3 FDC-P) + 1 Adult 4 FDC + 3 tabs E';
      dailyDoseText = '3 tabs HRZ + 1 tab 4 FDC + 3 tabs E daily';
      supplyIssued = 'Pediatric combo (7 strips)';
    } else {
      regimenName = '3 tabs (2 FDC-P) + 1 Adult 3 FDC + 3 tabs E';
      dailyDoseText = '3 tabs HR + 1 tab 3 FDC + 3 tabs E daily';
      supplyIssued = 'Pediatric combo (7 strips)';
    }
  } else {
    weightBand = '30–39 kg';
    dailyTablets = 6;
    strips = 6;
    if (normalizedPhase === 'IP') {
      regimenName = '2 tabs (3 FDC-P) + 2 Adult 4 FDC + 2 tabs E';
      dailyDoseText = '2 tabs HRZ + 2 tabs 4 FDC + 2 tabs E daily';
      supplyIssued = 'Pediatric combo (6 strips)';
    } else {
      regimenName = '2 tabs (2 FDC-P) + 2 Adult 3 FDC + 2 tabs E';
      dailyDoseText = '2 tabs HR + 2 tabs 3 FDC + 2 tabs E daily';
      supplyIssued = 'Pediatric combo (6 strips)';
    }
  }

  return {
    isValid: true,
    error: null,
    patientType: 'pediatric',
    weightKg: weight,
    phase: normalizedPhase,
    phaseText: normalizedPhase === 'IP' ? 'Intensive Phase (IP)' : 'Continuation Phase (CP)',
    regimenName,
    weightBand,
    dailyDoseText,
    supplyIssued,
    dailyTablets,
    strips
  };
}
