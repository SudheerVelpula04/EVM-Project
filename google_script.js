/**
 * Google Apps Script for School EVM Google Sheet Integration
 * 
 * =========================================================================
 * HOW TO DEPLOY AND LINK TO YOUR EVM:
 * =========================================================================
 * 1. Open Google Sheets (create a new blank spreadsheet).
 * 2. Click "Extensions" in the top menu, then select "Apps Script".
 * 3. Delete any default code in the editor (e.g. `myFunction() {}`).
 * 4. Copy this entire file content and paste it into the editor.
 * 5. Click the floppy disk icon (Save) or press Ctrl+S.
 * 6. Click the blue "Deploy" button at the top right, and choose "New deployment".
 * 7. Click the gear icon next to "Select type" and choose "Web app".
 * 8. Fill in the deployment details:
 *    - Description: School EVM Sync
 *    - Execute as: Me (your-email@gmail.com)
 *    - Who has access: Anyone
 * 9. Click "Deploy".
 * 10. You will be prompted to "Authorize Access". Click it, select your Google account, 
 *     click "Advanced" at the bottom, and click "Go to Untitled project (unsafe)" / "Allow".
 * 11. Copy the "Web app URL" provided in the deployment confirmation dialog.
 * 12. Log in as Admin in the EVM app, go to Settings, paste this URL, and click Save.
 * =========================================================================
 */

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Set CORS headers for browser compatibility
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  
  try {
    // Parse the incoming vote payload (works even if sent as text/plain to avoid preflight CORS)
    var payload = e.postData.contents;
    var data = JSON.parse(payload);
    
    // Initialize headers if spreadsheet is blank
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Vote ID",
        "Date & Time",
        "Election Title",
        "Organization",
        "Organizer",
        "Election Date",
        "Venue",
        "Election Category",
        "Candidate Voted",
        "Synced At"
      ]);
      // Format headers: Bold, background color, frozen row
      sheet.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#e0f2fe").setFontColor("#0369a1");
      sheet.setFrozenRows(1);
    }
    
    // Process votes (support single vote or array batch upload)
    var votes = Array.isArray(data) ? data : [data];
    
    for (var i = 0; i < votes.length; i++) {
      var vote = votes[i];
      sheet.appendRow([
        vote.id || "N/A",
        vote.timestamp || "",
        vote.electionTitle || "",
        vote.electionOrganization || "",
        vote.electionOrganizerName || vote.organizer || "System",
        vote.electionDate || "",
        vote.electionVenue || "",
        vote.category || "",
        vote.candidate || "",
        new Date().toLocaleString()
      ]);
    }
    
    // Return success response
    var response = { status: "success", count: votes.length };
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader("Access-Control-Allow-Origin", "*");
      
  } catch (error) {
    var errResponse = { status: "error", message: error.toString() };
    return ContentService.createTextOutput(JSON.stringify(errResponse))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader("Access-Control-Allow-Origin", "*");
  }
}

// Support pre-flight request verification
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function doGet(e) {
  return ContentService.createTextOutput("EVM Sync Web App is active! Please use HTTP POST to submit vote records.")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader("Access-Control-Allow-Origin", "*");
}
