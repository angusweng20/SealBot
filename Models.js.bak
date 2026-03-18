/**
 * MODELS & DATABASE
 */

const Database = {
  getSpreadsheet: function() {
     const id = CONFIG.SHEET_ID;
     return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  },

  getReminderSheet: function() {
    return this.getSpreadsheet().getSheetByName(SHEETS.REMINDERS);
  },

  // Reminders
  addReminder: function(reminderData) {
      // Schema: [Status, NextRun, Freq, Content, TargetID, TargetType, Creator]
      const sheet = this.getReminderSheet();
      sheet.appendRow([
        reminderData.status,
        reminderData.nextRun,
        reminderData.freq,
        reminderData.content,
        reminderData.targetId,
        reminderData.targetType,
        reminderData.creatorId
      ]);
  },

  getActiveRemindersForUser: function(targetId) {
     const sheet = this.getReminderSheet();
     const data = sheet.getDataRange().getValues();
     const results = [];
     
     // Start from 1 to skip header
     for (let i = 1; i < data.length; i++) {
       const row = data[i];
       // Check if active (Status=Col 0) and belongs to target (TargetID=Col 4)
       if (row[0] === '待執行' && row[4] === targetId) {
          results.push({
            rowIndex: i + 1, // Store 1-based row index for cancellation
            runTime: new Date(row[1]),
            content: row[3], // Content is Col 3
            freq: row[2]
          });
       }
     }
     return results;
  },
  
  cancelReminder: function(rowIndex) {
     const sheet = this.getReminderSheet();
     if (rowIndex > sheet.getLastRow() || rowIndex < 2) return false;
     
     const currentStatus = sheet.getRange(rowIndex, 1).getValue();
     if (currentStatus === '待執行' || currentStatus === '已暫停') {
        sheet.getRange(rowIndex, 1).setValue('取消');
        return true;
     }
     return false;
  },
  
  // For Trigger Processing
  getAllRemindersRaw: function() {
     return this.getReminderSheet().getDataRange().getValues();
  },
  
  updateReminderAfterRun: function(rowIndex, freqCode, nextRun) {
      const sheet = this.getReminderSheet();
      if (freqCode === 'ONCE' || !freqCode) {
          sheet.getRange(rowIndex, 1).setValue('已完成');
      } else {
          sheet.getRange(rowIndex, 2).setValue(nextRun);
      }
  }
};
