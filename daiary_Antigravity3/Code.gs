/**
 * 日記＆目標管理Webアプリ用 GAS バックエンドAPI
 * このスクリプトは Google Sheets をデータベースとして使用し、JSONでデータの送受信を行います。
 */

function doPost(e) {
  return handleRequest('POST', e);
}

function doGet(e) {
  return handleRequest('GET', e);
}

function handleRequest(method, e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // GET: データの全取得などに利用
    if (method === 'GET') {
      const action = e.parameter.action;
      if (action === 'getAllData') {
        const data = {
          MonthlyGoals: getSheetData(ss, "MonthlyGoals"),
          WeeklyGoals: getSheetData(ss, "WeeklyGoals"),
          DailyRecords: getSheetData(ss, "DailyRecords"),
          Tasks: getSheetData(ss, "Tasks")
        };
        return createResponse({ status: "success", data: data });
      }
      return createResponse({ status: "success", message: "API is working. Parameter action=getAllData is required to get data." });
    }

    // POST: データの保存・更新・削除
    if (method === 'POST') {
      const payloadString = e.postData ? e.postData.contents : "{}";
      const payload = JSON.parse(payloadString);
      const action = payload.action;
      
      if (action === 'saveRecord') {
        saveRecordToSheet(ss, payload.sheetName, payload.data);
        return createResponse({ status: "success" });
      }
      if (action === 'deleteRecord') {
        deleteRecordFromSheet(ss, payload.sheetName, payload.idKey, payload.idValue);
        return createResponse({ status: "success" });
      }
    }
    
    return createResponse({ status: "error", message: "Invalid action or missing parameters." });

  } catch (error) {
    return createResponse({ status: "error", message: String(error) });
  }
}

// レスポンスの生成（JSONを返すための処理・CORS対応）
function createResponse(responseObject) {
  return ContentService.createTextOutput(JSON.stringify(responseObject))
    .setMimeType(ContentService.MimeType.JSON);
}

// 各シートからデータをJSON配列として取得
function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // 1行目はヘッダー
  
  const headers = data[0];
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    result.push(obj);
  }
  return result;
}

// データの保存または更新（第1カラムをプライマリキーとみなす設計）
function saveRecordToSheet(ss, sheetName, dataObj) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  
  const dataContainer = sheet.getDataRange().getValues();
  // 万一シートが空ならヘッダーを生成する簡易ロジック
  if (dataContainer.length === 0) {
    sheet.appendRow(Object.keys(dataObj));
  }
  
  const headers = sheet.getDataRange().getValues()[0];
  const idKey = headers[0]; // シートの第1列目をIDキーとする
  const idValue = dataObj[idKey];
  
  // 編集：既存行があれば上書き
  for (let i = 1; i < dataContainer.length; i++) {
    if (String(dataContainer[i][0]) === String(idValue)) {
      const newRow = headers.map((h, idx) => dataObj[h] !== undefined ? dataObj[h] : dataContainer[i][idx]);
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([newRow]);
      return;
    }
  }
  
  // 追加：該当行がなければ新規追加
  const newRow = headers.map(h => dataObj[h] !== undefined ? dataObj[h] : "");
  sheet.appendRow(newRow);
}

// データの削除
function deleteRecordFromSheet(ss, sheetName, idKey, idValue) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(idValue)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
  throw new Error("Record not found to delete");
}

/*
 * 【便利な関数】
 * 初回のみ、GASエディタで「setupSheets」を選択して実行すると、
 * 自動的に必要なシートとヘッダー列が作成されます。
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsInfo = {
    // スプレッドシート名 : [1列目(ID), 2列目以降...]
    "MonthlyGoals": ["yearMonth", "goal"],
    "WeeklyGoals": ["yearWeek", "goal"],
    "DailyRecords": ["dateId", "body", "rating"],
    "Tasks": ["taskId", "dateId", "content", "status"]
  };
  
  for (const [name, headers] of Object.entries(sheetsInfo)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    // ヘッダー行が存在しない場合は追加
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    }
  }
}
