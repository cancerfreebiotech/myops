// Client-safe: constants and types only, no server imports.
//
// ============================================================================
// SINGLE SOURCE OF TRUTH — Ask-AI（文件問答）語料的 doc_type 白名單
// ============================================================================
// 這份清單同時決定三件事，三者必須永遠一致：
//   1. 哪些文件會被切段、embedding 後寫進 doc_chunks（src/lib/doc-index.ts）
//   2. 向量檢索失敗時，全文 fallback 會撈哪些文件（src/lib/policy-qa.ts）
//   3. DB 函式 match_doc_chunks() 的 allowed_doc_types 參數
//      （由 policy-qa 呼叫時傳入；函式本身也有同值的預設值當第二層防線）
//
// 為什麼要收成一處：以上三處原本各自寫死 ['REG','ANN','INTERNAL']。任一處
// 漂移就會造成語料範圍不一致，最壞情況是機密文件被餵進對全體員工開放的問答。
//
// ⚠️ 刻意排除的類型（documents.doc_type CHECK 共七種，這裡只收三種）：
//   - NDA      保密協議
//   - MOU      合作備忘錄
//   - CONTRACT 合約
//   - AMEND    合約增補
// 理由：文件問答對「全體員工」開放，回答內容不做逐人權限過濾。上述四類是
// 對外簽署的機密文件，一旦入索引就等於把合約條款、報價、對方資訊洩漏給
// 所有人。這不是效能取捨，是權限邊界——新增 doc_type 時預設不要加進來，
// 除非該類型的內容確定可對全體員工公開。
//
// 改動這份清單時：DB 端預設值在
// supabase/migrations/20260729000011_match_doc_chunks_types.sql，
// 且既有 doc_chunks 需要重跑一次全量索引（管理員設定頁的「重建文件索引」）
// 才會把新類型補進去 / 把移除的類型清掉。
// ============================================================================

export const ASK_AI_DOC_TYPES = ['REG', 'ANN', 'INTERNAL'] as const

export type AskAiDocType = (typeof ASK_AI_DOC_TYPES)[number]

/** 該 doc_type 是否屬於問答語料（可入索引 / 可被檢索） */
export function isAskAiDocType(value: string | null | undefined): value is AskAiDocType {
  return !!value && (ASK_AI_DOC_TYPES as readonly string[]).includes(value)
}
