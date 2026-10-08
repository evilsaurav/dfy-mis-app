import React from 'react';
import { CHANGELOG_ENTRIES, APP_VERSION, LAST_UPDATED_DATE } from '../../changelogData';

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
import TravelAllowanceModal from './modals/TravelAllowanceModal';
import { TA_FEATURE_ENABLED } from '../../config/featureFlags';

export default function AdminModals(props) {
  const { showAppGuideModal = props.showAppGuideModal } = props;
  return (
    <>
      {/* 1. Security & Password Settings */}
      <SecurityModal
        isOpen={props.showSecurityModal}
        show={props.showSecurityModal}
        onClose={() => props.setShowSecurityModal(false)}
        handleUpdatePassword={props.handleUpdatePassword}
        changeCurrentPw={props.changeCurrentPw}
        setChangeCurrentPw={props.setChangeCurrentPw}
        changeNewPw={props.changeNewPw}
        setChangeNewPw={props.setChangeNewPw}
        securityStatusMsg={props.securityStatusMsg}
        isSavingSecurity={props.isSavingSecurity}
      />

      {/* 2. Cascade Alerts Modal */}
      <CascadeAlertsModal
        isOpen={props.showCascadeModal}
        show={props.showCascadeModal}
        onClose={() => props.setShowCascadeModal(false)}
        cascadeData={props.cascadeData || { summary: {}, alerts: [] }}
        month={props.month}
        cascadeFilterDist={props.cascadeFilterDist}
        setCascadeFilterDist={props.setCascadeFilterDist}
        districts={props.districts || []}
        cascadeRiskFilter={props.cascadeRiskFilter}
        setCascadeRiskFilter={props.setCascadeRiskFilter || props.setRiskFilter}
        fetchCascadeAlerts={props.fetchCascadeAlerts}
        getAdminToken={props.getAdminToken}
        currentUser={props.currentUser}
        loadingCascade={props.loadingCascade}
      />

      {/* 3. Recent ID Edits Audit */}
      <RecentIdEditsModal
        isOpen={props.showRecentIdEditsModal}
        show={props.showRecentIdEditsModal}
        onClose={() => props.setShowRecentIdEditsModal(false)}
        recentIdEditsFilterAction={props.recentIdEditsFilterAction}
        setRecentIdEditsFilterAction={props.setRecentIdEditsFilterAction}
        recentIdEditsSearch={props.recentIdEditsSearch}
        setRecentIdEditsSearch={props.setRecentIdEditsSearch}
        recentIdEditsLoading={props.recentIdEditsLoading}
        fetchRecentIdEdits={props.fetchRecentIdEdits}
        recentIdEdits={props.recentIdEdits || []}
      />

      {/* 4. Changelog Modal */}
      <ChangelogModal
        show={props.showChangelogModal}
        onClose={() => props.setShowChangelogModal(false)}
        changelogEntries={CHANGELOG_ENTRIES}
        appVersion={APP_VERSION}
        lastUpdatedDate={LAST_UPDATED_DATE}
      />

      {/* 5. Patient Journey Timeline */}
      <JourneyModal
        show={props.showJourneyModal}
        onClose={() => props.setShowJourneyModal(false)}
        journeySearchId={props.journeyPatientId || props.journeySearchId}
        setJourneySearchId={props.setJourneyPatientId || props.setJourneySearchId}
        journeyLoading={props.journeyLoading}
        journeyError={props.journeyError}
        journeyResult={props.journeyResult}
        handleFetchJourney={props.handleFetchJourney}
        showToast={props.showToast}
      />

      {/* 6. Automated Backup Status & Trigger */}
      <BackupModal
        show={props.showBackupModal}
        onClose={() => props.setShowBackupModal(false)}
        backupStatus={props.backupStatus}
        backupLoading={props.backupLoading}
        backupActionMsg={props.backupActionMsg}
        setBackupActionMsg={props.setBackupActionMsg}
        backupTriggerLoading={props.backupTriggerLoading}
        restoreTargetFile={props.restoreTargetFile}
        setRestoreTargetFile={props.setRestoreTargetFile}
        restoreConfirmText={props.restoreConfirmText}
        setRestoreConfirmText={props.setRestoreConfirmText}
        restoreLoading={props.restoreLoading}
        fetchBackupStatus={props.fetchBackupStatus}
        handleTriggerBackupNow={props.handleTriggerBackupNow}
        handleDownloadBackup={props.handleDownloadBackup}
        handleExecuteRestore={props.handleExecuteRestore}
      />

      {/* 7. Top Performers Studio & Poster Generator */}
      <TopPerformersModal
        show={props.showTopPerformersModal}
        onClose={() => props.setShowTopPerformersModal(false)}
        adminTargetViewMode={props.adminTargetViewMode}
        topPerformersPeriod={props.topPerformersPeriod}
        setTopPerformersPeriod={props.setTopPerformersPeriod}
        fetchTopPerformers={props.fetchTopPerformers}
        month={props.month}
        topPerformersData={props.topPerformersData}
        loadingTopPerformers={props.loadingTopPerformers}
        topPerformerRandomMsg={props.topPerformerRandomMsg}
        setTopPerformerRandomMsg={props.setTopPerformerRandomMsg}
        topPerformersCanvasRef={props.topPerformersCanvasRef}
        handleShareTopPerformersWhatsApp={props.handleShareTopPerformersWhatsApp}
        handleDownloadTopPerformersPoster={props.handleDownloadTopPerformersPoster}
      />

      {/* 8. Admin Users & Permissions Manager */}
      <AdminUsersModal
        show={props.showAdminUsersModal}
        onClose={() => props.setShowAdminUsersModal(false)}
        loadingAdminUsers={props.loadingAdminUsers || props.adminUsersLoading}
        adminUsersList={props.adminUsersList || []}
        deleteAdminUser={props.deleteAdminUser}
        userFormModal={props.userFormModal}
        setUserFormModal={props.setUserFormModal}
        saveAdminUser={props.saveAdminUser}
        staffDirectory={props.staffDirectory || {}}
        isSuperAdmin={props.isSuperAdmin}
        prefillAccessList={props.prefillAccessList || []}
        fetchPrefillAccessList={props.fetchPrefillAccessList}
        handleTogglePrefillAccess={props.handleTogglePrefillAccess}
      />

      {/* 9. Audit Trail Inspector */}
      <AuditTrailModal
        show={props.showAuditModal}
        onClose={() => props.setShowAuditModal(false)}
        isSuperAdmin={props.isSuperAdmin}
        handleManualPruneAuditLogs={props.handleManualPruneAuditLogs}
        isPruningAudit={props.isPruningAudit}
        exportAuditLogsExcel={props.exportAuditLogsExcel}
        fetchAuditLogs={props.fetchAuditLogs}
        loadingAuditLogs={props.loadingAuditLogs || props.auditLoading}
        auditFilterAction={props.auditFilterAction}
        setAuditFilterAction={props.setAuditFilterAction}
        auditFilterDistrict={props.auditFilterDistrict || props.auditFilterTarget}
        setAuditFilterDistrict={props.setAuditFilterDistrict || props.setAuditFilterTarget}
        staffDirectory={props.staffDirectory || {}}
        auditFilterUser={props.auditFilterUser || props.auditFilterAdmin}
        setAuditFilterUser={props.setAuditFilterUser || props.setAuditFilterAdmin}
        adminUsersList={props.adminUsersList || []}
        auditSearchQuery={props.auditSearchQuery}
        setAuditSearchQuery={props.setAuditSearchQuery}
        auditLogsList={props.auditLogsList || props.auditLogs || []}
      />

      {/* 10. Unread Broadcast Popup */}
      <UnreadBroadcastPopupModal
        unreadBroadcastPopup={props.unreadBroadcastPopup}
        dismissBroadcastPopup={props.dismissBroadcastPopup}
        popup={props.unreadBroadcastPopup}
        onDismiss={props.dismissBroadcastPopup}
      />

      {/* 11. Central Broadcast Studio */}
      <BroadcastStudioModal
        show={props.showBroadcastModal}
        onClose={() => props.setShowBroadcastModal(false)}
        newBroadcastModal={props.newBroadcastModal}
        setNewBroadcastModal={props.setNewBroadcastModal}
        currentUser={props.currentUser}
        isSuperAdmin={props.isSuperAdmin}
        districts={props.districts || []}
        handleCreateBroadcast={props.handleCreateBroadcast}
        broadcastsList={props.broadcastsList || props.broadcastHistory || []}
        fetchAllBroadcasts={props.fetchAllBroadcasts}
        loadingBroadcasts={props.loadingBroadcasts || props.broadcastLoading}
        handleDeleteBroadcast={props.handleDeleteBroadcast}
      />

      {/* 12. Notification Tray Modal */}
      <NotifTrayModal
        show={props.showNotifTrayModal}
        onClose={() => props.setShowNotifTrayModal(false)}
        month={props.month}
        setAppGuideActiveTopic={props.setAppGuideActiveTopic}
        setShowAppGuideModal={props.setShowAppGuideModal}
        notifTrayCopiedNotice={props.notifTrayCopiedNotice}
        notifTrayData={props.notifTrayData}
        notifTrayDistricts={props.notifTrayDistricts || []}
        availableKpiDistricts={props.availableKpiDistricts || []}
        copyToClipboardWithFallback={props.copyToClipboardWithFallback}
        build24ColTsv={props.build24ColTsv}
        handleClearNotifDistricts={props.handleClearNotifDistricts}
        handleSelectAllNotifDistricts={props.handleSelectAllNotifDistricts}
        handleToggleNotifDistrict={props.handleToggleNotifDistrict}
        notifTraySearch={props.notifTraySearch || props.notifTraySearchQuery}
        setNotifTraySearch={props.setNotifTraySearch || props.setNotifTraySearchQuery}
      />

      {/* 13. App Guide & SOP Manual */}
      <AppGuideModal
        show={showAppGuideModal}
        onClose={() => props.setShowAppGuideModal(false)}
        appGuideSearch={props.appGuideSearch || props.appGuideSearchQuery}
        setAppGuideSearch={props.setAppGuideSearch || props.setAppGuideSearchQuery}
        appGuideActiveTopic={props.appGuideActiveTopic}
        setAppGuideActiveTopic={props.setAppGuideActiveTopic}
      />

      {/* 14. Ni-kshay Reconciler Studio */}
      <NikshayModal
        show={props.showNikshayModal}
        onClose={() => props.setShowNikshayModal(false)}
        nikshayResult={props.nikshayResult}
        setNikshayResult={props.setNikshayResult}
        nikshayFile={props.nikshayFile}
        setNikshayFile={props.setNikshayFile}
        nikshayError={props.nikshayError}
        setNikshayError={props.setNikshayError}
        ledgerViewMode={props.ledgerViewMode}
        setLedgerViewMode={props.setLedgerViewMode}
        ledgerData={props.ledgerData}
        fetchCumulativeLedger={props.fetchCumulativeLedger}
        ledgerSearch={props.ledgerSearch}
        setLedgerSearch={props.setLedgerSearch}
        ledgerDistrict={props.ledgerDistrict}
        setLedgerDistrict={props.setLedgerDistrict}
        nikshaySyncStatus={props.nikshaySyncStatus}
        nikshayActiveTab={props.nikshayActiveTab}
        setNikshayActiveTab={props.setNikshayActiveTab}
        nikshayDistrict={props.nikshayDistrict}
        setNikshayDistrict={props.setNikshayDistrict}
        nikshayMonth={props.nikshayMonth}
        setNikshayMonth={props.setNikshayMonth}
        nikshayLoading={props.nikshayLoading}
        handleReconcileNikshay={props.handleReconcileNikshay}
        handleDownloadReviewSheet={props.handleDownloadReviewSheet}
        handleExportCumulativeLedger={props.handleExportCumulativeLedger}
        ledgerLoading={props.ledgerLoading}
        ledgerExporting={props.ledgerExporting}
        currentUser={props.currentUser}
        isSubAdmin={props.isSubAdmin}
        districts={props.districts || []}
        month={props.month}
        setShowJourneyModal={props.setShowJourneyModal}
        setJourneySearchId={props.setJourneySearchId || props.setJourneyPatientId}
        handleFetchJourney={props.handleFetchJourney}
        selectedDistrict={props.selectedDistrict || props.nikshayDistrict || 'All'}
        reviewExporting={props.reviewExporting}
        getAdminToken={props.getAdminToken || (() => '')}
      />

      {/* 15. Admin Backdated Feeding Studio */}
      <AdminFeedModal
        show={props.showAdminFeedModal}
        onClose={() => props.setShowAdminFeedModal(false)}
        currentUser={props.currentUser}
        feedError={props.feedError}
        setFeedError={props.setFeedError}
        feedSuccess={props.feedSuccess}
        setFeedSuccess={props.setFeedSuccess}
        feedDistrict={props.feedDistrict}
        setFeedDistrict={props.setFeedDistrict}
        feedFoName={props.feedFoName}
        setFeedFoName={props.setFeedFoName}
        feedDate={props.feedDate}
        setFeedDate={props.setFeedDate || props.setDate}
        availableDistrictsForFeed={props.availableDistrictsForFeed || []}
        availableFosForFeed={props.availableFosForFeed || []}
        feedShowAllCategories={props.feedShowAllCategories}
        setFeedShowAllCategories={props.setFeedShowAllCategories}
        feedCategoriesConfig={props.feedCategoriesConfig || []}
        feedCategoryInputs={props.feedCategoryInputs || {}}
        setFeedCategoryInputs={props.setFeedCategoryInputs}
        feedRemarks={props.feedRemarks}
        setFeedRemarks={props.setFeedRemarks}
        feedLoading={props.feedLoading}
        handleAdminFeedSubmit={props.handleAdminFeedSubmit}
      />

      {/* 16. Target Setting & Allocation Studio */}
      <TargetSettingModal
        show={props.showTargetModal}
        onClose={() => props.setShowTargetModal(false)}
        targetModalMonth={props.targetModalMonth}
        setTargetModalMonth={props.setTargetModalMonth}
        loadTargets={props.loadTargets}
        targetModalDistrict={props.targetModalDistrict}
        setTargetModalDistrict={props.setTargetModalDistrict}
        targetModalDistricts={props.targetModalDistricts || []}
        officialTargetsByDistrict={props.officialTargetsByDistrict || props.tempOfficialTargets || {}}
        officialDistrictTarget={props.officialDistrictTarget}
        setOfficialDistrictTarget={props.setOfficialDistrictTarget}
        targetModalTab={props.targetModalTab}
        setTargetModalTab={props.setTargetModalTab}
        handleCopyFromLastMonth={props.handleCopyFromLastMonth}
        targetSearchQuery={props.targetSearchQuery}
        setTargetSearchQuery={props.setTargetSearchQuery}
        targets={props.targets || props.tempOfficialTargets || {}}
        targetsData={props.targetsData || {}}
        handleTargetChange={props.handleTargetChange}
        handleSaveBulkDistrictTargets={props.handleSaveBulkDistrictTargets}
        isSavingBulkDistrictTargets={props.isSavingBulkDistrictTargets}
        handleSaveSingleDistrictTarget={props.handleSaveSingleDistrictTarget}
        isSavingDistrictTarget={props.isSavingDistrictTarget}
        saveAllTargets={props.saveAllTargets}
        handleSaveAllTargetsCombined={props.handleSaveAllTargetsCombined}
        handleExecuteTargetSave={props.handleExecuteTargetSave}
        isSavingTargets={props.isSavingTargets}
        frontlineAllocated={props.frontlineAllocated || 0}
        staffDirectory={props.staffDirectory || {}}
        tempOfficialTargets={props.tempOfficialTargets || props.officialTargetsByDistrict || {}}
        setTempOfficialTargets={props.setTempOfficialTargets || (() => {})}
      />

      {/* 17. Live Attendance Radar */}
      <AttendanceRadarModal
        show={props.showAttendanceModal}
        onClose={() => props.setShowAttendanceModal(false)}
        attendance={props.attendance}
        chronicDefaulters={props.chronicDefaulters}
        attendanceDistrictFilter={props.attendanceDistrictFilter}
        setAttendanceDistrictFilter={props.setAttendanceDistrictFilter}
        attendanceTimeFilter={props.attendanceTimeFilter}
        setAttendanceTimeFilter={props.setAttendanceTimeFilter}
        attendanceSearchQuery={props.attendanceSearchQuery}
        setAttendanceSearchQuery={props.setAttendanceSearchQuery}
        inactiveStaffNamesSet={props.inactiveStaffNamesSet}
        attendanceDate={props.attendanceDate}
        setAttendanceDate={props.setAttendanceDate}
        fetchAttendance={props.fetchAttendance}
        isAttendanceLoading={props.isAttendanceLoading}
        activeAttendanceTab={props.activeAttendanceTab}
        setActiveAttendanceTab={props.setActiveAttendanceTab}
        leaveActionModal={props.leaveActionModal}
        setLeaveActionModal={props.setLeaveActionModal}
        handleExecuteMarkLeave={props.handleExecuteMarkLeave}
        handleExecuteUnmarkLeave={props.handleExecuteUnmarkLeave}
        attendanceRemarkModal={props.attendanceRemarkModal}
        setAttendanceRemarkModal={props.setAttendanceRemarkModal}
        handleExecuteAttendanceRemark={props.handleExecuteAttendanceRemark}
        isSavingAttendanceRemark={props.isSavingAttendanceRemark}
        getSubmissionTimeClassification={props.getSubmissionTimeClassification}
        districts={props.districts || []}
        districtAttendanceRollup={props.districtAttendanceRollup || {}}
        copyMissingReminder={props.copyMissingReminder || (() => {})}
        copySubmittedSummary={props.copySubmittedSummary || (() => {})}
        copyDefaultersWarning={props.copyDefaultersWarning || (() => {})}
        copyDistrictSpecificSummary={props.copyDistrictSpecificSummary || (() => {})}
        copyOnLeaveSummary={props.copyOnLeaveSummary || (() => {})}
        isSavingLeave={props.isSavingLeave || false}
        copiedAttendance={props.copiedAttendance || false}
      />

      {/* 18. Duplicate Patient ID Radar */}
      <DuplicateRadarModal
        show={props.showDuplicateModal}
        onClose={() => props.setShowDuplicateModal(false)}
        duplicateAudit={props.duplicateAudit}
        duplicateScanData={props.duplicateScanData}
        month={props.month}
        fetchDuplicateAudit={props.fetchDuplicateAudit}
        fetchDuplicateScan={props.fetchDuplicateScan}
        duplicateScanLoading={props.duplicateScanLoading}
        duplicateRadarTab={props.duplicateRadarTab}
        setDuplicateRadarTab={props.setDuplicateRadarTab}
        duplicateRepairing={props.duplicateRepairing || props.repairingDocId}
        handleRepairDuplicates={props.handleRepairDuplicates || props.handleRepairDuplicate}
        repairingDocId={props.repairingDocId || null}
        handleRepairDuplicate={props.handleRepairDuplicate || props.handleRepairDuplicates || (() => {})}
      />

      {/* 19. FO Field Officer Inspector */}
      <FoInspectorModal
        inspectingFO={props.inspectingFO}
        onClose={() => props.setInspectingFO(null)}
        rawRecords={props.rawRecords}
        staffDirectory={props.staffDirectory}
        targetsData={props.targetsData}
        foSearchId={props.foSearchId}
        setFoSearchId={props.setFoSearchId}
        month={props.month}
        setEditingRecord={props.setEditingRecord || (() => {})}
        setDeleteDayModal={props.setDeleteDayModal}
        selectedDistrict={props.selectedDistrict || 'All'}
        setFeedDistrict={props.setFeedDistrict || (() => {})}
        setFeedFoName={props.setFeedFoName || (() => {})}
        setFeedDate={props.setFeedDate || (() => {})}
        setFeedCategoryInputs={props.setFeedCategoryInputs || (() => {})}
        setFeedRemarks={props.setFeedRemarks || (() => {})}
        setFeedError={props.setFeedError || (() => {})}
        setFeedSuccess={props.setFeedSuccess || (() => {})}
        setShowAdminFeedModal={props.setShowAdminFeedModal || (() => {})}
        handleOpenEditDay={props.handleOpenEditDay || (() => {})}
        setAdminEditModal={props.setAdminEditModal || (() => {})}
      />

      {/* 20. Staff Management Suite */}
      <StaffManagementModal
        showStaffSuite={props.showStaffSuite}
        setShowStaffSuite={props.setShowStaffSuite}
        staffList={props.staffList || []}
        districts={props.districts || []}
        staffFilterDistrict={props.staffFilterDistrict}
        setStaffFilterDistrict={props.setStaffFilterDistrict}
        staffSearchQuery={props.staffSearchQuery}
        setStaffSearchQuery={props.setStaffSearchQuery}
        staffStatusFilter={props.staffStatusFilter}
        setStaffStatusFilter={props.setStaffStatusFilter}
        targetsData={props.targetsData || []}
        currentUser={props.currentUser}
        showPinMap={props.showPinMap || {}}
        setShowPinMap={props.setShowPinMap}
        pinChangeModal={props.pinChangeModal}
        setPinChangeModal={props.setPinChangeModal}
        handleExecuteUpdatePin={props.handleExecuteUpdatePin}
        addStaffModal={props.addStaffModal}
        setAddStaffModal={props.setAddStaffModal}
        handleExecuteAddStaff={props.handleExecuteAddStaff}
        deleteStaffModal={props.deleteStaffModal}
        setDeleteStaffModal={props.setDeleteStaffModal}
        handleExecuteDeleteStaff={props.handleExecuteDeleteStaff}
        staffToggleModal={props.staffToggleModal}
        setStaffToggleModal={props.setStaffToggleModal}
        handleExecuteToggleStaffStatus={props.handleExecuteToggleStaffStatus}
        isTogglingStaff={props.isTogglingStaff}
        fetchStaffList={props.fetchStaffList}
      />

      {/* 21. Admin Edit ID Modal */}
      <AdminEditIdModal
        adminEditModal={props.adminEditModal}
        setAdminEditModal={props.setAdminEditModal}
        handleAdminExecuteIdEdit={props.handleAdminExecuteIdEdit}
      />

      {/* 22. Delete Day Report Modal */}
      <DeleteDayReportModal
        deleteDayModal={props.deleteDayModal}
        setDeleteDayModal={props.setDeleteDayModal}
        handleExecuteDeleteDay={props.handleExecuteDeleteDay}
      />

      {/* 23. Edit Day Report Modal */}
      <EditDayReportModal
        editDayModal={props.editDayModal}
        setEditDayModal={props.setEditDayModal}
        handleExecuteEditDay={props.handleExecuteEditDay}
        feedCategoriesConfig={props.feedCategoriesConfig}
      />

      {/* 24. Reports Studio & Excel Generator */}
      <ReportsStudioModal
        showReportsStudio={props.showReportsStudio}
        setShowReportsStudio={props.setShowReportsStudio}
        month={props.month}
        staffDirectory={props.staffDirectory || {}}
        isSubAdmin={props.isSubAdmin}
        reportsStudioTab={props.reportsStudioTab}
        setReportsStudioTab={props.setReportsStudioTab}
        reportsDistrict={props.reportsDistrict}
        setReportsDistrict={props.setReportsDistrict}
        availableKpiDistricts={props.availableKpiDistricts || []}
        selectedKpiDistricts={props.selectedKpiDistricts || []}
        isDownloadingKpi={props.isDownloadingKpi}
        handleSelectAllKpiDistricts={props.handleSelectAllKpiDistricts}
        handleClearKpiDistricts={props.handleClearKpiDistricts}
        handleToggleKpiDistrict={props.handleToggleKpiDistrict}
        kpiQueueProgress={props.kpiQueueProgress}
        canDownloadBulkZip={props.canDownloadBulkZip}
        handleDownloadScopedZip={props.handleDownloadScopedZip}
        handleDownloadSequentialQueue={props.handleDownloadSequentialQueue}
        handleDownloadKpi={props.handleDownloadKpi}
        rawRecords={props.rawRecords || []}
        currentUser={props.currentUser}
        selectedMedDistricts={props.selectedMedDistricts || []}
        selectedDistrict={props.selectedDistrict || 'All'}
        selectedFO={props.selectedFO || 'All'}
        handleSelectAllMedDistricts={props.handleSelectAllMedDistricts}
        handleClearMedDistricts={props.handleClearMedDistricts}
        handleToggleMedDistrict={props.handleToggleMedDistrict}
        isDownloadingMedicineReport={props.isDownloadingMedicineReport}
        medQueueProgress={props.medQueueProgress}
        handleDownloadMedicineReport={props.handleDownloadMedicineReport}
        handleDownloadSequentialMedQueue={props.handleDownloadSequentialMedQueue || props.handleDownloadMedicineReportQueue}
        getAdminToken={props.getAdminToken}
        availableAttendanceDistricts={props.availableAttendanceDistricts || props.availableKpiDistricts || []}
        selectedAttendanceDistricts={props.selectedAttendanceDistricts || []}
        isDownloadingAttendance={props.isDownloadingAttendance}
        handleSelectAllAttendanceDistricts={props.handleSelectAllAttendanceDistricts}
        handleClearAttendanceDistricts={props.handleClearAttendanceDistricts}
        handleToggleAttendanceDistrict={props.handleToggleAttendanceDistrict}
        attendanceQueueProgress={props.attendanceQueueProgress}
        handleDownloadAttendanceSingleOrScoped={props.handleDownloadAttendanceSingleOrScoped}
        handleDownloadStaffAttendanceQueue={props.handleDownloadStaffAttendanceQueue}
        totals={props.totals || {}}
        copyWhatsAppBulletin={props.copyWhatsAppBulletin}
        copiedBulletin={props.copiedBulletin || false}
        liveWhatsAppBulletin={props.liveWhatsAppBulletin}
        onOpenTravelAllowance={() => props.setShowTaModal?.(true)}
      />

      {/* 25. Travel Allowance Modal */}
      {TA_FEATURE_ENABLED && (
        <TravelAllowanceModal
          isOpen={props.showTaModal}
          onClose={() => props.setShowTaModal(false)}
          taMonth={props.taMonth}
          setTaMonth={props.setTaMonth}
          taDistrict={props.taDistrict}
          setTaDistrict={props.setTaDistrict}
          roster={props.roster}
          selectedOfficer={props.selectedOfficer}
          setSelectedOfficer={props.setSelectedOfficer}
          viewMode={props.viewMode}
          setViewMode={props.setViewMode}
          ratePerKm={props.ratePerKm}
          editingRate={props.editingRate}
          setEditingRate={props.setEditingRate}
          newRateInput={props.newRateInput}
          setNewRateInput={props.setNewRateInput}
          showContextMenu={props.showContextMenu}
          setShowContextMenu={props.setShowContextMenu}
          loadingRoster={props.loadingRoster}
          isSubmitting={props.isSubmitting}
          revertModalStaff={props.revertModalStaff}
          setRevertModalStaff={props.setRevertModalStaff}
          revertReason={props.revertReason}
          setRevertReason={props.setRevertReason}
          drilldownLog={props.drilldownLog}
          setDrilldownLog={props.setDrilldownLog}
          deductionAmount={props.deductionAmount}
          setDeductionAmount={props.setDeductionAmount}
          deductionReason={props.deductionReason}
          setDeductionReason={props.setDeductionReason}
          canPrefill={props.canPrefill}
          prefillAccessList={props.prefillAccessList}
          loadingAccessList={props.loadingAccessList}
          showPrefillManageModal={props.showPrefillManageModal}
          setShowPrefillManageModal={props.setShowPrefillManageModal}
          fetchPrefillAccessList={props.fetchPrefillAccessList}
          handleTogglePrefillAccess={props.handleTogglePrefillAccess}
          isSuperAdmin={props.isSuperAdmin}
          isSubAdmin={props.isSubAdmin || props.isSuperAdmin}
          isIncharge={props.isIncharge || props.isSuperAdmin}
          canEdit={props.canEdit}
          fetchRoster={props.fetchRoster}
          fetchRate={props.fetchRate}
          handlePrefill={props.handlePrefill}
          handleSaveLog={props.handleSaveLog}
          handleSubmitRoster={props.handleSubmitRoster}
          handlePassStaff={props.handlePassStaff}
          handleRevertStaff={props.handleRevertStaff}
          handleUnlockStaff={props.handleUnlockStaff}
          handleUpdateRate={props.handleUpdateRate}
          handleExportExcel={props.handleExportExcel}
          districts={props.districts || []}
          currentUser={props.currentUser}
        />
      )}
    </>
  );
}
