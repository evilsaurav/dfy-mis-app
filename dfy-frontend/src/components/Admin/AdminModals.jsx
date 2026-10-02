import React from 'react';
import { CHANGELOG_ENTRIES, APP_VERSION, LAST_UPDATED_DATE } from '../../changelogData';
import { DEFAULT_BIHAR_DISTRICTS } from '../../utils/districtHelpers';

// 24 Modular Administration Modals
import SecurityModal from './modals/SecurityModal';
import CascadeAlertsModal from './modals/CascadeAlertsModal';
import RecentIdEditsModal from './modals/RecentIdEditsModal';
import ChangelogModal from './modals/ChangelogModal';
import JourneyModal from './modals/JourneyModal';
import BackupModal from './modals/BackupModal';
import TopPerformersModal from './modals/TopPerformersModal';
import AdminUsersModal from './modals/AdminUsersModal';
import AuditTrailModal from './modals/AuditTrailModal';
import UnreadBroadcastPopupModal from './modals/UnreadBroadcastPopupModal';
import BroadcastStudioModal from './modals/BroadcastStudioModal';
import NotifTrayModal from './modals/NotifTrayModal';
import AppGuideModal from './modals/AppGuideModal';
import NikshayModal from './modals/NikshayModal';
import AdminFeedModal from './modals/AdminFeedModal';
import TargetSettingModal from './modals/TargetSettingModal';
import AttendanceRadarModal from './modals/AttendanceRadarModal';
import DuplicateRadarModal from './modals/DuplicateRadarModal';
import FoInspectorModal from './modals/FoInspectorModal';
import StaffManagementModal from './modals/StaffManagementModal';
import AdminEditIdModal from './modals/AdminEditIdModal';
import DeleteDayReportModal from './modals/DeleteDayReportModal';
import EditDayReportModal from './modals/EditDayReportModal';
import ReportsStudioModal from './modals/ReportsStudioModal';

export default function AdminModals(props) {
  const {
    // 1. Security
    showSecurityModal,
    setShowSecurityModal,
    changeCurrentPw,
    setChangeCurrentPw,
    changeNewPw,
    setChangeNewPw,
    securityStatusMsg,
    setSecurityStatusMsg,
    isSavingSecurity,

    // 2. Cascade Alerts
    showCascadeModal,
    setShowCascadeModal,
    cascadeData,
    loadingCascade,
    cascadeFilterDist,
    setCascadeFilterDist,
    cascadeRiskFilter,
    setRiskFilter,

    // 3. Recent ID Edits
    showRecentIdEditsModal,
    setShowRecentIdEditsModal,
    recentIdEdits,
    recentIdEditsLoading,
    recentIdEditsFilterAction,
    setRecentIdEditsFilterAction,
    recentIdEditsSearch,
    setRecentIdEditsSearch,
    fetchRecentIdEdits,

    // 4. Changelog
    showChangelogModal,
    setShowChangelogModal,

    // 5. Patient Journey
    showJourneyModal,
    setShowJourneyModal,
    journeyPatientId,
    setJourneyPatientId,
    journeyLoading,
    journeyResult,
    journeyError,

    // 6. Automated Backup
    showBackupModal,
    setShowBackupModal,
    backupStatus,
    backupLoading,
    backupTriggerLoading,
    backupActionMsg,
    restoreConfirmText,
    setRestoreConfirmText,
    restoreTargetFile,
    setRestoreTargetFile,
    restoreLoading,

    // 7. Top Performers Studio
    showTopPerformersModal,
    setShowTopPerformersModal,
    adminTargetViewMode,
    topPerformersPeriod,
    setTopPerformersPeriod,
    fetchTopPerformers,
    month,
    topPerformersData,
    loadingTopPerformers,
    topPerformerRandomMsg,
    setTopPerformerRandomMsg,
    topPerformersCanvasRef,
    handleShareTopPerformersWhatsApp,
    handleDownloadTopPerformersPoster,

    // 8. Admin Users
    showAdminUsersModal,
    setShowAdminUsersModal,
    adminUsersList,
    adminUsersLoading,
    currentUser,
    adminUserEditModal,
    setAdminUserEditModal,
    newAdminModal,
    setNewAdminModal,
    deleteAdminModal,
    setDeleteAdminModal,
    isSavingAdminUser,

    // 9. Audit Trail
    showAuditModal,
    setShowAuditModal,
    auditLogs,
    auditLoading,
    auditFilterAction,
    setAuditFilterAction,
    auditFilterTarget,
    setAuditFilterTarget,
    auditFilterAdmin,
    setAuditFilterAdmin,
    auditSearchQuery,
    setAuditSearchQuery,
    formatAuditTimestamp,

    // 10. Unread Broadcast Popup
    unreadBroadcastPopup,
    setUnreadBroadcastPopup,

    // 11. Broadcast Studio
    showBroadcastModal,
    setShowBroadcastModal,
    activeBroadcasts,
    broadcastHistory,
    broadcastLoading,
    isSendingBroadcast,
    newBroadcastModal,
    setNewBroadcastModal,
    deleteBroadcastModal,
    setDeleteBroadcastModal,
    fetchActiveBroadcasts,

    // 12. Notif Tray
    showNotifTrayModal,
    setShowNotifTrayModal,
    notifTrayFilterDistrict,
    setNotifTrayFilterDistrict,
    notifTraySearchQuery,
    setNotifTraySearchQuery,
    notifTrayCategoryFilter,
    setCategoryFilter,
    isExportingNotifTray,
    setIsExportingNotifTray,

    // 13. App Guide SOP
    showAppGuideModal,
    setShowAppGuideModal,
    appGuideActiveTopic,
    setAppGuideActiveTopic,
    appGuideSearchQuery,
    setAppGuideSearchQuery,

    // 14. Nikshay Reconciler
    showNikshayModal,
    setShowNikshayModal,
    nikshayFilterMonth,
    setNikshayFilterMonth,
    nikshayRecords,
    nikshayLoading,
    nikshaySyncing,
    nikshayFilterDist,
    setNikshayFilterDist,
    nikshaySearch,
    setNikshaySearch,
    nikshayFilterStatus,
    setNikshayFilterStatus,
    nikshaySelectedPatient,
    setNikshaySelectedPatient,
    nikshayEditForm,
    setNikshayEditForm,
    nikshaySaving,
    isExportingNikshay,
    setIsExportingNikshay,

    // 15. Admin Backdated Feeding
    showAdminFeedModal,
    setShowAdminFeedModal,
    feedDistrict,
    setFeedDistrict,
    feedFoName,
    setFeedFoName,
    feedDate,
    setDate,
    categoryInputs,
    setCategoryInputs,
    visitedNames,
    setVisitedNames,
    feedRemarks,
    setRemarks,
    travelExpense,
    setTravelExpense,
    morningKm,
    setMorningKm,
    eveningKm,
    setEveningKm,
    isNextDay,
    setIsNextDay,
    submissionCount,
    setSubmissionCount,
    isSubmitting,
    feedError,
    feedSuccess,
    availableDistrictsForFeed,
    feedCategoriesConfig,
    fetchData,

    // 16. Target Setting
    showTargetModal,
    setShowTargetModal,
    targetModalMonth,
    setTargetModalMonth,
    targetModalDistrict,
    setTargetModalDistrict,
    targetModalTab,
    setTargetModalTab,
    targetSearchQuery,
    setTargetSearchQuery,
    targetModalDistricts,
    officialDistrictTarget,
    setOfficialDistrictTarget,
    tempOfficialTargets,
    setTempOfficialTargets,
    targetsData,
    isSavingTargets,
    isSavingDistrictTarget,
    isSavingBulkDistrictTargets,
    bulkTargetValue,
    setBulkTargetValue,

    // 17. Attendance Radar
    showAttendanceModal,
    setShowAttendanceModal,
    attendance,
    chronicDefaulters,
    attendanceDistrictFilter,
    setAttendanceDistrictFilter,
    attendanceTimeFilter,
    setAttendanceTimeFilter,
    attendanceSearchQuery,
    setAttendanceSearchQuery,
    inactiveStaffNamesSet,
    attendanceDate,
    setAttendanceDate,
    fetchAttendance,
    isAttendanceLoading,
    activeAttendanceTab,
    setActiveAttendanceTab,
    leaveActionModal,
    setLeaveActionModal,
    handleExecuteMarkLeave,
    handleExecuteUnmarkLeave,
    attendanceRemarkModal,
    setAttendanceRemarkModal,
    handleExecuteAttendanceRemark,
    isSavingAttendanceRemark,
    getSubmissionTimeClassification,

    // 18. Duplicate Radar
    showDuplicateModal,
    setShowDuplicateModal,
    duplicateRadarTab,
    setDuplicateRadarTab,
    duplicateAudit,
    duplicateScanData,
    duplicateScanLoading,
    repairingDocId,
    fetchDuplicateScan,
    compareDistA,
    setCompareDistA,
    compareDistB,
    setCompareDistB,

    // 19. FO Inspector
    inspectingFO,
    setInspectingFO,
    rawRecords,
    staffDirectory,
    foSearchId,
    setFoSearchId,

    // 20. Staff Management Suite
    showStaffSuite,
    setShowStaffSuite,
    staffList,
    staffSearchQuery,
    setStaffSearchQuery,
    staffFilterDistrict,
    setStaffFilterDistrict,
    staffStatusFilter,
    setStaffStatusFilter,
    pinChangeModal,
    setPinChangeModal,
    addStaffModal,
    setAddStaffModal,
    deleteStaffModal,
    setDeleteStaffModal,
    staffToggleModal,
    setStaffToggleModal,
    isTogglingStaff,
    showPinMap,
    setShowPinMap,
    handleExecuteUpdatePin,
    handleExecuteAddStaff,
    fetchStaffList,

    // 21. Admin Edit ID
    adminEditModal,
    setAdminEditModal,

    // 22. Delete Day Report
    deleteDayModal,
    setDeleteDayModal,

    // 23. Edit Day Report
    editDayModal,
    setEditDayModal,

    // 24. Reports Studio
    showReportsStudio,
    setShowReportsStudio,
    reportsStudioTab,
    setReportsStudioTab,
    reportsDistrict,
    setReportsDistrict,
    availableKpiDistricts,
    selectedKpiDistricts,
    handleToggleKpiDistrict,
    handleSelectAllKpiDistricts,
    handleClearKpiDistricts,
    isDownloadingKpi,
    handleDownloadKpi,
    canDownloadBulkZip,
    handleDownloadScopedZip,
    handleDownloadSequentialQueue,
    kpiQueueProgress,
    selectedMedDistricts,
    handleToggleMedDistrict,
    handleSelectAllMedDistricts,
    handleClearMedDistricts,
    isDownloadingMedicineReport,
    handleDownloadMedicineReport,
    handleDownloadMedicineReportScopedZip,
    handleDownloadMedicineReportQueue,
    medQueueProgress,
    selectedAttendanceDistricts,
    handleToggleAttendanceDistrict,
    handleSelectAllAttendanceDistricts,
    handleClearAttendanceDistricts,
    isDownloadingAttendance,
    handleDownloadAttendanceSingleOrScoped,
    handleDownloadStaffAttendanceQueue,
    attendanceQueueProgress,
    copyWhatsAppBulletin,
    liveWhatsAppBulletin,

    // Shared & Context
    districts,
    authFetch,
    getAdminToken,
    showToast
  } = props;

  return (
    <>
      <SecurityModal
        show={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        currentPassword={changeCurrentPw}
        setCurrentPassword={setChangeCurrentPw}
        newPassword={changeNewPw}
        setNewPassword={setChangeNewPw}
        statusMessage={securityStatusMsg}
        setStatusMessage={setSecurityStatusMsg}
        isLoading={isSavingSecurity}
        authFetch={authFetch}
        showToast={showToast}
      />

      <CascadeAlertsModal
        show={showCascadeModal}
        onClose={() => setShowCascadeModal(false)}
        cascadeData={cascadeData}
        loading={loadingCascade}
        filterDistrict={cascadeFilterDist}
        setFilterDistrict={setCascadeFilterDist}
        riskFilter={cascadeRiskFilter}
        setRiskFilter={setRiskFilter}
        districts={districts}
      />

      <RecentIdEditsModal
        show={showRecentIdEditsModal}
        onClose={() => setShowRecentIdEditsModal(false)}
        recentIdEdits={recentIdEdits}
        loading={recentIdEditsLoading}
        filterAction={recentIdEditsFilterAction}
        setFilterAction={setRecentIdEditsFilterAction}
        searchQuery={recentIdEditsSearch}
        setSearchQuery={setRecentIdEditsSearch}
        formatAuditTimestamp={formatAuditTimestamp}
        onRefresh={fetchRecentIdEdits}
      />

      <ChangelogModal
        show={showChangelogModal}
        onClose={() => setShowChangelogModal(false)}
        changelogEntries={CHANGELOG_ENTRIES}
        appVersion={APP_VERSION}
        lastUpdatedDate={LAST_UPDATED_DATE}
      />

      <JourneyModal
        show={showJourneyModal}
        onClose={() => setShowJourneyModal(false)}
        patientId={journeyPatientId}
        setPatientId={setJourneyPatientId}
        loading={journeyLoading}
        journeyResult={journeyResult}
        error={journeyError}
        authFetch={authFetch}
        showToast={showToast}
      />

      <BackupModal
        show={showBackupModal}
        onClose={() => setShowBackupModal(false)}
        backupStatus={backupStatus}
        loading={backupLoading}
        triggerLoading={backupTriggerLoading}
        actionMsg={backupActionMsg}
        restoreConfirmText={restoreConfirmText}
        setRestoreConfirmText={setRestoreConfirmText}
        restoreTargetFile={restoreTargetFile}
        setRestoreTargetFile={setRestoreTargetFile}
        restoreLoading={restoreLoading}
        onTriggerBackup={() => {}}
        onRestore={() => {}}
        onRefresh={() => {}}
        getAdminToken={getAdminToken}
        showToast={showToast}
      />

      <TopPerformersModal
        show={showTopPerformersModal}
        onClose={() => setShowTopPerformersModal(false)}
        adminTargetViewMode={adminTargetViewMode}
        topPerformersPeriod={topPerformersPeriod}
        setTopPerformersPeriod={setTopPerformersPeriod}
        fetchTopPerformers={fetchTopPerformers}
        month={month}
        topPerformersData={topPerformersData}
        loadingTopPerformers={loadingTopPerformers}
        topPerformerRandomMsg={topPerformerRandomMsg}
        setTopPerformerRandomMsg={setTopPerformerRandomMsg}
        topPerformersCanvasRef={topPerformersCanvasRef}
        handleShareTopPerformersWhatsApp={handleShareTopPerformersWhatsApp}
        handleDownloadTopPerformersPoster={handleDownloadTopPerformersPoster}
      />

      <AdminUsersModal
        show={showAdminUsersModal}
        onClose={() => setShowAdminUsersModal(false)}
        adminUsersList={adminUsersList}
        loading={adminUsersLoading}
        onRefresh={() => {}}
        currentUser={currentUser}
        editModal={adminUserEditModal}
        setEditModal={setAdminUserEditModal}
        newModal={newAdminModal}
        setNewModal={setNewAdminModal}
        deleteModal={deleteAdminModal}
        setDeleteModal={setDeleteAdminModal}
        isSaving={isSavingAdminUser}
        authFetch={authFetch}
        showToast={showToast}
        allDistricts={DEFAULT_BIHAR_DISTRICTS}
      />

      <AuditTrailModal
        show={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        auditLogs={auditLogs}
        loading={auditLoading}
        filterAction={auditFilterAction}
        setFilterAction={setAuditFilterAction}
        filterDistrict={auditFilterTarget}
        setFilterDistrict={setAuditFilterTarget}
        filterAdmin={auditFilterAdmin}
        setFilterAdmin={setAuditFilterAdmin}
        searchQuery={auditSearchQuery}
        setSearchQuery={setAuditSearchQuery}
        onRefresh={() => {}}
        formatAuditTimestamp={formatAuditTimestamp}
        districts={districts}
        authFetch={authFetch}
        showToast={showToast}
      />

      <UnreadBroadcastPopupModal
        popup={unreadBroadcastPopup}
        onDismiss={() => setUnreadBroadcastPopup(null)}
      />

      <BroadcastStudioModal
        show={showBroadcastModal}
        onClose={() => setShowBroadcastModal(false)}
        activeBroadcasts={activeBroadcasts}
        broadcastHistory={broadcastHistory}
        loading={broadcastLoading}
        isSending={isSendingBroadcast}
        newModal={newBroadcastModal}
        setNewModal={setNewBroadcastModal}
        deleteModal={deleteBroadcastModal}
        setDeleteModal={setDeleteBroadcastModal}
        authFetch={authFetch}
        showToast={showToast}
        currentUser={currentUser}
        allDistricts={DEFAULT_BIHAR_DISTRICTS}
        onRefresh={fetchActiveBroadcasts}
      />

      <NotifTrayModal
        show={showNotifTrayModal}
        onClose={() => setShowNotifTrayModal(false)}
        notifTrayData={{ allIds: [] }}
        filterDistrict={notifTrayFilterDistrict}
        setFilterDistrict={setNotifTrayFilterDistrict}
        searchQuery={notifTraySearchQuery}
        setSearchQuery={setNotifTraySearchQuery}
        categoryFilter={notifTrayCategoryFilter}
        setCategoryFilter={setCategoryFilter}
        districts={districts}
        isExporting={isExportingNotifTray}
        setIsExporting={setIsExportingNotifTray}
        showToast={showToast}
      />

      <AppGuideModal
        show={showAppGuideModal}
        onClose={() => setShowAppGuideModal(false)}
        activeTopic={appGuideActiveTopic}
        setActiveTopic={setAppGuideActiveTopic}
        searchQuery={appGuideSearchQuery}
        setSearchQuery={setAppGuideSearchQuery}
      />

      <NikshayModal
        show={showNikshayModal}
        onClose={() => setShowNikshayModal(false)}
        month={nikshayFilterMonth}
        setMonth={setNikshayFilterMonth}
        records={nikshayRecords}
        loading={nikshayLoading}
        syncing={nikshaySyncing}
        filterDistrict={nikshayFilterDist}
        setFilterDistrict={setNikshayFilterDist}
        searchQuery={nikshaySearch}
        setSearchQuery={setNikshaySearch}
        filterStatus={nikshayFilterStatus}
        setFilterStatus={setNikshayFilterStatus}
        selectedPatient={nikshaySelectedPatient}
        setSelectedPatient={setNikshaySelectedPatient}
        editForm={nikshayEditForm}
        setEditForm={setNikshayEditForm}
        isSaving={nikshaySaving}
        isExporting={isExportingNikshay}
        setIsExporting={setIsExportingNikshay}
        districts={districts}
        authFetch={authFetch}
        showToast={showToast}
        onRefresh={() => {}}
      />

      <AdminFeedModal
        show={showAdminFeedModal}
        onClose={() => setShowAdminFeedModal(false)}
        district={feedDistrict}
        setDistrict={setFeedDistrict}
        foName={feedFoName}
        setFoName={setFeedFoName}
        date={feedDate}
        setDate={setDate}
        categoryInputs={categoryInputs}
        setCategoryInputs={setCategoryInputs}
        visitedNames={visitedNames}
        setVisitedNames={setVisitedNames}
        remarks={feedRemarks}
        setRemarks={setRemarks}
        travelExpense={travelExpense}
        setTravelExpense={setTravelExpense}
        morningKm={morningKm}
        setMorningKm={setMorningKm}
        eveningKm={eveningKm}
        setEveningKm={setEveningKm}
        isNextDay={isNextDay}
        setIsNextDay={setIsNextDay}
        submissionCount={submissionCount}
        setSubmissionCount={setSubmissionCount}
        isSubmitting={isSubmitting}
        error={feedError}
        success={feedSuccess}
        staffDirectory={staffDirectory}
        availableDistricts={availableDistrictsForFeed}
        categoriesConfig={feedCategoriesConfig}
        authFetch={authFetch}
        showToast={showToast}
        onSuccess={() => fetchData(true)}
      />

      <TargetSettingModal
        show={showTargetModal}
        onClose={() => setShowTargetModal(false)}
        month={targetModalMonth}
        setMonth={setTargetModalMonth}
        district={targetModalDistrict}
        setDistrict={setTargetModalDistrict}
        activeTab={targetModalTab}
        setActiveTab={setTargetModalTab}
        searchQuery={targetSearchQuery}
        setSearchQuery={setTargetSearchQuery}
        districts={targetModalDistricts}
        officialDistrictTarget={officialDistrictTarget}
        setOfficialDistrictTarget={setOfficialDistrictTarget}
        tempOfficialTargets={tempOfficialTargets}
        setTempOfficialTargets={setTempOfficialTargets}
        targetsData={targetsData}
        staffDirectory={staffDirectory}
        isSavingTargets={isSavingTargets}
        isSavingDistrictTarget={isSavingDistrictTarget}
        isSavingBulkDistrictTargets={isSavingBulkDistrictTargets}
        bulkTargetValue={bulkTargetValue}
        setBulkTargetValue={setBulkTargetValue}
        onSaveDistrictTarget={() => {}}
        onSaveSingleDistrictTarget={() => {}}
        onSaveBulkDistrictTargets={() => {}}
        onSaveAllCombined={() => {}}
        onCopyFromLastMonth={() => {}}
        onTargetChange={() => {}}
      />

      <AttendanceRadarModal
        show={showAttendanceModal}
        onClose={() => setShowAttendanceModal(false)}
        attendance={attendance}
        chronicDefaulters={chronicDefaulters}
        attendanceDistrictFilter={attendanceDistrictFilter}
        setAttendanceDistrictFilter={setAttendanceDistrictFilter}
        attendanceTimeFilter={attendanceTimeFilter}
        setAttendanceTimeFilter={setAttendanceTimeFilter}
        attendanceSearchQuery={attendanceSearchQuery}
        setAttendanceSearchQuery={setAttendanceSearchQuery}
        inactiveStaffNamesSet={inactiveStaffNamesSet}
        attendanceDate={attendanceDate}
        setAttendanceDate={setAttendanceDate}
        fetchAttendance={fetchAttendance}
        isAttendanceLoading={isAttendanceLoading}
        activeAttendanceTab={activeAttendanceTab}
        setActiveAttendanceTab={setActiveAttendanceTab}
        leaveActionModal={leaveActionModal}
        setLeaveActionModal={setLeaveActionModal}
        handleExecuteMarkLeave={handleExecuteMarkLeave}
        handleExecuteUnmarkLeave={handleExecuteUnmarkLeave}
        attendanceRemarkModal={attendanceRemarkModal}
        setAttendanceRemarkModal={setAttendanceRemarkModal}
        handleExecuteAttendanceRemark={handleExecuteAttendanceRemark}
        isSavingAttendanceRemark={isSavingAttendanceRemark}
        getSubmissionTimeClassification={getSubmissionTimeClassification}
        districts={districts}
      />

      <DuplicateRadarModal
        show={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        activeTab={duplicateRadarTab}
        setActiveTab={setDuplicateRadarTab}
        duplicateAudit={duplicateAudit}
        duplicateScanData={duplicateScanData}
        scanLoading={duplicateScanLoading}
        repairingDocId={repairingDocId}
        onRepair={() => {}}
        onScan={fetchDuplicateScan}
        compareDistA={compareDistA}
        setCompareDistA={setCompareDistA}
        compareDistB={compareDistB}
        setCompareDistB={setCompareDistB}
        districts={districts}
      />

      <FoInspectorModal
        inspectingFO={inspectingFO}
        onClose={() => setInspectingFO(null)}
        rawRecords={rawRecords}
        staffDirectory={staffDirectory}
        targetsData={targetsData}
        foSearchId={foSearchId}
        setFoSearchId={setFoSearchId}
        month={month}
        setEditingRecord={() => {}}
        setDeleteDayModal={setDeleteDayModal}
      />

      <StaffManagementModal
        show={showStaffSuite}
        onClose={() => setShowStaffSuite(false)}
        staffList={staffList}
        staffSearchQuery={staffSearchQuery}
        setStaffSearchQuery={setStaffSearchQuery}
        staffFilterDistrict={staffFilterDistrict}
        setStaffFilterDistrict={setStaffFilterDistrict}
        staffStatusFilter={staffStatusFilter}
        setStaffStatusFilter={setStaffStatusFilter}
        districts={districts}
        pinChangeModal={pinChangeModal}
        setPinChangeModal={setPinChangeModal}
        addStaffModal={addStaffModal}
        setAddStaffModal={setAddStaffModal}
        deleteStaffModal={deleteStaffModal}
        setDeleteStaffModal={setDeleteStaffModal}
        staffToggleModal={staffToggleModal}
        setStaffToggleModal={setStaffToggleModal}
        isTogglingStaff={isTogglingStaff}
        showPinMap={showPinMap}
        setShowPinMap={setShowPinMap}
        handleExecuteUpdatePin={handleExecuteUpdatePin || (() => {})}
        handleExecuteAddStaff={handleExecuteAddStaff || (() => {})}
        handleExecuteDeleteStaff={() => {}}
        handleExecuteToggleStaffStatus={() => {}}
        formatAuditTimestamp={formatAuditTimestamp}
        onRefresh={fetchStaffList}
      />

      <AdminEditIdModal
        adminEditModal={adminEditModal}
        setAdminEditModal={setAdminEditModal}
        handleAdminExecuteIdEdit={() => {}}
      />

      <DeleteDayReportModal
        deleteDayModal={deleteDayModal}
        setDeleteDayModal={setDeleteDayModal}
        handleExecuteDeleteDay={() => {}}
      />

      <EditDayReportModal
        editDayModal={editDayModal}
        setEditDayModal={setEditDayModal}
        handleExecuteEditDay={() => {}}
        feedCategoriesConfig={feedCategoriesConfig}
      />

      <ReportsStudioModal
        showReportsStudio={showReportsStudio}
        setShowReportsStudio={setShowReportsStudio}
        reportsStudioTab={reportsStudioTab}
        setReportsStudioTab={setReportsStudioTab}
        month={month}
        staffDirectory={staffDirectory}
        reportsDistrict={reportsDistrict}
        setReportsDistrict={setReportsDistrict}
        availableKpiDistricts={availableKpiDistricts}
        selectedKpiDistricts={selectedKpiDistricts}
        handleToggleKpiDistrict={handleToggleKpiDistrict}
        handleSelectAllKpiDistricts={handleSelectAllKpiDistricts}
        handleClearKpiDistricts={handleClearKpiDistricts}
        isDownloadingKpi={isDownloadingKpi}
        handleDownloadKpi={handleDownloadKpi}
        canDownloadBulkZip={canDownloadBulkZip}
        handleDownloadScopedZip={handleDownloadScopedZip}
        handleDownloadSequentialQueue={handleDownloadSequentialQueue}
        kpiQueueProgress={kpiQueueProgress}
        selectedMedDistricts={selectedMedDistricts}
        handleToggleMedDistrict={handleToggleMedDistrict}
        handleSelectAllMedDistricts={handleSelectAllMedDistricts}
        handleClearMedDistricts={handleClearMedDistricts}
        isDownloadingMedicineReport={isDownloadingMedicineReport}
        handleDownloadMedicineReport={handleDownloadMedicineReport}
        handleDownloadMedicineReportScopedZip={handleDownloadMedicineReportScopedZip}
        handleDownloadMedicineReportQueue={handleDownloadMedicineReportQueue}
        medQueueProgress={medQueueProgress}
        selectedAttendanceDistricts={selectedAttendanceDistricts}
        handleToggleAttendanceDistrict={handleToggleAttendanceDistrict}
        handleSelectAllAttendanceDistricts={handleSelectAllAttendanceDistricts}
        handleClearAttendanceDistricts={handleClearAttendanceDistricts}
        isDownloadingAttendance={isDownloadingAttendance}
        handleDownloadAttendanceSingleOrScoped={handleDownloadAttendanceSingleOrScoped}
        handleDownloadStaffAttendanceQueue={handleDownloadStaffAttendanceQueue}
        attendanceQueueProgress={attendanceQueueProgress}
        copiedBulletin={false}
        copyWhatsAppBulletin={copyWhatsAppBulletin}
        liveWhatsAppBulletin={liveWhatsAppBulletin}
      />
    </>
  );
}
