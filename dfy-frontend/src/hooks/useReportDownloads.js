import { useCallback } from 'react';

export function useReportDownloads({
  month,
  selectedDistrict = 'All',
  reportsDistrict = 'All',
  districts = [],
  availableKpiDistricts = [],
  selectedKpiDistricts = [],
  setSelectedKpiDistricts,
  selectedMedDistricts = [],
  setSelectedMedDistricts,
  selectedAttendanceDistricts = [],
  setSelectedAttendanceDistricts,
  isDownloadingKpi = false,
  setIsDownloadingKpi,
  kpiQueueProgress,
  setKpiQueueProgress,
  isDownloadingMedicineReport = false,
  setIsDownloadingMedicineReport,
  medQueueProgress,
  setMedQueueProgress,
  isDownloadingAttendance = false,
  setIsDownloadingAttendance,
  attendanceQueueProgress,
  setAttendanceQueueProgress,
  authFetch,
  getAdminToken,
  showToast
}) {
  const handleToggleKpiDistrict = (dist) => {
    setSelectedKpiDistricts(prev => {
      if (prev.includes(dist)) {
        return prev.filter(d => d !== dist);
      } else {
        return [...prev, dist];
      }
    });
  };

  const handleSelectAllKpiDistricts = () => {
    setSelectedKpiDistricts([...availableKpiDistricts]);
  };

  const handleClearKpiDistricts = () => {
    setSelectedKpiDistricts([]);
  };

  const handleDownloadKpi = async () => {
    if (isDownloadingKpi) return;
    const validPermitted = (districts || []).filter(d => d !== 'All');
    const fallback = validPermitted.length > 0 ? validPermitted[0] : '';
    const targetDist = (reportsDistrict && reportsDistrict !== 'All') 
      ? reportsDistrict 
      : (selectedDistrict !== 'All' ? selectedDistrict : fallback);
    if (!targetDist) {
      showToast("Please select a district to download.", "error");
      return;
    }
    setIsDownloadingKpi(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/download-kpi-workbook?district=${encodeURIComponent(targetDist)}&month=${month}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Download failed with HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `KPI_Report_${targetDist}_${month}.xlsx`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(downloadUrl);
      link.remove();
      showToast(`✓ KPI Report for ${targetDist} downloaded successfully!`, "success");
    } catch (err) {
      console.error("Error downloading district KPI workbook:", err);
      showToast(`KPI Download Error: ${err.message}`, "error");
    } finally {
      setIsDownloadingKpi(false);
    }
  };

  const handleToggleMedDistrict = (dist) => {
    setSelectedMedDistricts(prev => {
      if (prev.includes(dist)) {
        return prev.filter(d => d !== dist);
      } else {
        return [...prev, dist];
      }
    });
  };

  const handleSelectAllMedDistricts = () => {
    setSelectedMedDistricts([...availableKpiDistricts]);
  };

  const handleClearMedDistricts = () => {
    setSelectedMedDistricts([]);
  };

  const availableAttendanceDistricts = availableKpiDistricts;

  const handleToggleAttendanceDistrict = (dist) => {
    setSelectedAttendanceDistricts(prev => {
      if (prev.includes(dist)) {
        return prev.filter(d => d !== dist);
      } else {
        return [...prev, dist];
      }
    });
  };

  const handleSelectAllAttendanceDistricts = () => {
    setSelectedAttendanceDistricts([...availableAttendanceDistricts]);
  };

  const handleClearAttendanceDistricts = () => {
    setSelectedAttendanceDistricts([]);
  };

  const handleDownloadMedicineReport = () => {
    if (isDownloadingMedicineReport) return;
    setIsDownloadingMedicineReport(true);
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    let url = `${API_BASE_URL}/admin/reports/medicine-consumption?month=${month}&token=${getAdminToken()}`;
    if (selectedMedDistricts.length > 0) {
      url += `&districts=${encodeURIComponent(selectedMedDistricts.join(','))}`;
    } else {
      const targetDist = selectedDistrict || 'All';
      url += `&district=${encodeURIComponent(targetDist)}`;
    }
    window.open(url, "_blank");
    setTimeout(() => setIsDownloadingMedicineReport(false), 3000);
  };

  const handleDownloadSequentialMedQueue = async () => {
    if (isDownloadingMedicineReport) return;
    const targetList = selectedMedDistricts.length > 0 ? selectedMedDistricts : availableKpiDistricts;
    if (!targetList || targetList.length === 0) {
      showToast("Please select at least one district to download.", "error");
      return;
    }

    setIsDownloadingMedicineReport(true);
    const total = targetList.length;
    setMedQueueProgress({
      current: 0,
      total,
      district: '',
      percent: 0,
      status: `Initializing medicine queue for ${total} district(s)...`
    });

    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";

    for (let i = 0; i < total; i++) {
      const dist = targetList[i];
      setMedQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i) / total) * 100),
        status: `Generating Medicine Report for ${dist} (${i + 1}/${total})...`
      });

      try {
        const res = await authFetch(`${API_BASE_URL}/admin/reports/medicine-consumption?district=${encodeURIComponent(dist)}&month=${month}`);
        if (res.ok) {
          const blob = await res.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `Medicine_Consumption_${dist}_${month}.xlsx`;
          document.body.appendChild(link);
          link.click();
          window.URL.revokeObjectURL(downloadUrl);
          link.remove();
        } else {
          console.error(`Failed to download medicine report for ${dist}`);
        }
      } catch (err) {
        console.error(`Error downloading medicine report for ${dist}:`, err);
      }

      setMedQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i + 1) / total) * 100),
        status: `Completed ${dist} (${i + 1}/${total}) ✓`
      });

      // Intentional 1000ms pause between district files: Render CPU/RAM cooldown
      if (i < total - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    showToast(`✓ All ${total} district medicine workbooks downloaded successfully!`, "success");
    setMedQueueProgress({
      current: total,
      total,
      district: '',
      percent: 100,
      status: `All ${total} district medicine workbooks downloaded successfully!`
    });

    setTimeout(() => {
      setMedQueueProgress(null);
      setIsDownloadingMedicineReport(false);
    }, 2500);
  };

  const handleDownloadScopedZip = async () => {
    if (isDownloadingKpi) return;
    const targetList = selectedKpiDistricts.length > 0 ? selectedKpiDistricts : availableKpiDistricts;
    if (!targetList || targetList.length === 0) {
      showToast("Please select at least one district to download.", "error");
      return;
    }

    setIsDownloadingKpi(true);
    showToast(`📦 Preparing Scoped ZIP bundle for ${targetList.length} district(s)...`, "info");

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const distParam = `&districts=${encodeURIComponent(targetList.join(','))}`;
      const res = await authFetch(`${API_BASE_URL}/download-all-kpi-workbooks?month=${month}${distParam}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Bulk download failed with HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `District_KPI_Workbooks_${month}.zip`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(downloadUrl);
      link.remove();
      showToast(`✓ KPI ZIP archive (${targetList.length} districts) downloaded successfully!`, "success");
    } catch (err) {
      console.error("Error downloading scoped KPI zip:", err);
      showToast(`Bulk KPI Download Error: ${err.message}`, "error");
    } finally {
      setIsDownloadingKpi(false);
    }
  };

  const handleDownloadSequentialQueue = async () => {
    if (isDownloadingKpi) return;
    const targetList = selectedKpiDistricts.length > 0 ? selectedKpiDistricts : availableKpiDistricts;
    if (!targetList || targetList.length === 0) {
      showToast("Please select at least one district to download.", "error");
      return;
    }

    setIsDownloadingKpi(true);
    const total = targetList.length;
    setKpiQueueProgress({
      current: 0,
      total,
      district: '',
      percent: 0,
      status: `Initializing queue for ${total} district(s)...`
    });

    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";

    for (let i = 0; i < total; i++) {
      const dist = targetList[i];
      setKpiQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i) / total) * 100),
        status: `Generating Excel for ${dist} (${i + 1}/${total})...`
      });

      try {
        const res = await authFetch(`${API_BASE_URL}/download-kpi-workbook?district=${encodeURIComponent(dist)}&month=${month}`);
        if (res.ok) {
          const blob = await res.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `KPI_Report_${dist}_${month}.xlsx`;
          document.body.appendChild(link);
          link.click();
          window.URL.revokeObjectURL(downloadUrl);
          link.remove();
        } else {
          console.error(`Failed to download KPI for ${dist}`);
        }
      } catch (err) {
        console.error(`Error downloading ${dist}:`, err);
      }

      setKpiQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i + 1) / total) * 100),
        status: `Completed ${dist} (${i + 1}/${total}) ✓`
      });

      // Intentional 1000ms pause between district files: Render CPU/RAM cooldown
      if (i < total - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    showToast(`✓ All ${total} district workbooks downloaded successfully!`, "success");
    setKpiQueueProgress({
      current: total,
      total,
      district: '',
      percent: 100,
      status: `All ${total} district workbooks downloaded successfully!`
    });

    setTimeout(() => {
      setKpiQueueProgress(null);
      setIsDownloadingKpi(false);
    }, 2500);
  };

  const handleDownloadAttendanceSingleOrScoped = () => {
    if (isDownloadingAttendance) return;
    const targetList = selectedAttendanceDistricts.length > 0 ? selectedAttendanceDistricts : availableAttendanceDistricts;
    if (!targetList || targetList.length === 0) {
      showToast("Please select at least one district to download.", "error");
      return;
    }

    setIsDownloadingAttendance(true);
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";

    if (targetList.length === 1) {
      const dist = targetList[0];
      showToast(`📋 Preparing Staff Attendance workbook for ${dist}...`, "info");
      window.open(`${API_BASE_URL}/admin/export-staff-attendance?month=${month}&district=${encodeURIComponent(dist)}&token=${getAdminToken()}`, "_blank");
    } else {
      showToast(`📋 Preparing Scoped Staff Attendance workbook for ${targetList.length} district(s)...`, "info");
      const distParam = `&districts=${encodeURIComponent(targetList.join(','))}`;
      window.open(`${API_BASE_URL}/admin/export-staff-attendance?month=${month}${distParam}&token=${getAdminToken()}`, "_blank");
    }

    setTimeout(() => {
      setIsDownloadingAttendance(false);
    }, 4000);
  };

  const handleDownloadAttendanceScopedZip = handleDownloadAttendanceSingleOrScoped;

  const handleDownloadStaffAttendanceQueue = async () => {
    if (isDownloadingAttendance) return;
    const targetList = selectedAttendanceDistricts.length > 0 ? selectedAttendanceDistricts : availableAttendanceDistricts;
    if (!targetList || targetList.length === 0) {
      showToast("Please select at least one district to download.", "error");
      return;
    }

    setIsDownloadingAttendance(true);
    const total = targetList.length;
    setAttendanceQueueProgress({
      current: 0,
      total,
      district: '',
      percent: 0,
      status: `Initializing staff attendance queue for ${total} district(s)...`
    });

    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";

    for (let i = 0; i < total; i++) {
      const dist = targetList[i];
      setAttendanceQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i) / total) * 100),
        status: `Generating Attendance Excel for ${dist} (${i + 1}/${total})...`
      });

      try {
        const res = await authFetch(`${API_BASE_URL}/admin/export-staff-attendance?month=${month}&district=${encodeURIComponent(dist)}`);
        if (res.ok) {
          const blob = await res.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `DFY_Staff_Attendance_${dist}_${month}.xlsx`;
          document.body.appendChild(link);
          link.click();
          window.URL.revokeObjectURL(downloadUrl);
          link.remove();
        } else {
          console.error(`Failed to download staff attendance for ${dist}`);
        }
      } catch (err) {
        console.error(`Error downloading staff attendance for ${dist}:`, err);
      }

      setAttendanceQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i + 1) / total) * 100),
        status: `Completed ${dist} (${i + 1}/${total}) ✓`
      });

      // Intentional 1000ms pause between district files: Render CPU/RAM cooldown
      if (i < total - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    showToast(`✓ All ${total} district attendance workbooks downloaded successfully!`, "success");
    setAttendanceQueueProgress({
      current: total,
      total,
      district: '',
      percent: 100,
      status: `All ${total} district attendance workbooks downloaded successfully!`
    });

    setTimeout(() => {
      setAttendanceQueueProgress(null);
      setIsDownloadingAttendance(false);
    }, 2500);
  };

  return {
    handleToggleKpiDistrict,
    handleSelectAllKpiDistricts,
    handleClearKpiDistricts,
    handleDownloadKpi,
    handleToggleMedDistrict,
    handleSelectAllMedDistricts,
    handleClearMedDistricts,
    handleToggleAttendanceDistrict,
    handleSelectAllAttendanceDistricts,
    handleClearAttendanceDistricts,
    handleDownloadMedicineReport,
    handleDownloadSequentialMedQueue,
    handleDownloadScopedZip,
    handleDownloadSequentialQueue,
    handleDownloadAttendanceSingleOrScoped,
    handleDownloadAttendanceScopedZip,
    handleDownloadStaffAttendanceQueue
  };
}
