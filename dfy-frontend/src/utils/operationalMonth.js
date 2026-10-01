/**
 * Operational Month and Day 1 Month-End Grace Period Resolver
 *
 * Requirements:
 * - On the 1st of any month before 12:00 PM Noon:
 *   operationalMonth = previous month (YYYY-MM), isMonthEndGracePeriod = true.
 * - Otherwise:
 *   operationalMonth = current calendar month (YYYY-MM), isMonthEndGracePeriod = false.
 */

export const getOperationalMonth = (customDate = new Date()) => {
  const d = new Date(customDate);
  const day = d.getDate();
  const hours = d.getHours();

  if (day === 1 && hours < 12) {
    const prevMonthDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const yyyy = prevMonthDate.getFullYear();
    const mm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    return {
      operationalMonth: `${yyyy}-${mm}`,
      isMonthEndGracePeriod: true,
      graceClosingMonth: `${yyyy}-${mm}`,
      activeCalendarMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    };
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return {
    operationalMonth: `${yyyy}-${mm}`,
    isMonthEndGracePeriod: false,
    graceClosingMonth: null,
    activeCalendarMonth: `${yyyy}-${mm}`
  };
};

/**
 * Returns previous calendar month in YYYY-MM format
 */
export const getPreviousMonth = (monthStr) => {
  if (!monthStr || typeof monthStr !== 'string' || !monthStr.includes('-')) return '';
  try {
    const parts = monthStr.split('-');
    let y = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    return `${y}-${String(m).padStart(2, '0')}`;
  } catch (err) {
    return '';
  }
};

/**
 * Calculates Target Pacing & Forecaster metrics across 3 modes:
 * - Past Month: Closed month, zero extrapolation, exact achieved count.
 * - Current Month: Live in-flight pacing based on elapsed & remaining working days.
 * - Future Month: Pre-month planning, zero projection.
 */
export const calculateOverviewPacing = (
  {
    totalWorkingDays = 1,
    elapsedWorkingDays = 0,
    remainingWorkingDays = 0,
    isCurrentMonth = false,
    isPastMonth = false,
    isFutureMonth = false
  } = {},
  totalScopeNotif = 0,
  scopedTarget = 0
) => {
  const pendingScopeNotif = Math.max(0, scopedTarget - totalScopeNotif);

  let currentDailyRate = '0.0';
  let requiredDailyRate = '0.0';
  let projectedTotal = totalScopeNotif;
  let projectedPct = scopedTarget > 0 ? Math.round((totalScopeNotif / scopedTarget) * 100) : 100;
  let daysRemainingDisplay = 0;

  if (isPastMonth) {
    // Mode 1: Past Month (Completed Month Final View)
    currentDailyRate = totalWorkingDays > 0 ? (totalScopeNotif / totalWorkingDays).toFixed(1) : '0.0';
    requiredDailyRate = '0.0';
    projectedTotal = totalScopeNotif;
    projectedPct = scopedTarget > 0 ? Math.round((totalScopeNotif / scopedTarget) * 100) : 100;
    daysRemainingDisplay = 0;
  } else if (isCurrentMonth) {
    // Mode 2: Live In-Flight Pacing
    currentDailyRate = elapsedWorkingDays > 0 ? (totalScopeNotif / elapsedWorkingDays).toFixed(1) : totalScopeNotif.toFixed(1);
    requiredDailyRate = remainingWorkingDays > 0 ? (pendingScopeNotif / remainingWorkingDays).toFixed(1) : '0.0';
    projectedTotal = Math.round(totalScopeNotif + (Number(currentDailyRate) * remainingWorkingDays));
    projectedPct = scopedTarget > 0 ? Math.round((projectedTotal / scopedTarget) * 100) : 100;
    daysRemainingDisplay = remainingWorkingDays;
  } else {
    // Mode 3: Future Month
    currentDailyRate = '0.0';
    requiredDailyRate = totalWorkingDays > 0 ? (scopedTarget / totalWorkingDays).toFixed(1) : '0.0';
    projectedTotal = 0;
    projectedPct = 0;
    daysRemainingDisplay = totalWorkingDays;
  }

  return {
    currentDailyRate,
    requiredDailyRate,
    projectedTotal,
    projectedPct,
    daysRemainingDisplay
  };
};
