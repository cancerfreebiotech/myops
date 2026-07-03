// 入職/離職 Checklist 預設範本（建立時展開為 items，可再增刪）

export interface LifecycleTemplateItem {
  title: string
  category: 'account' | 'equipment' | 'access' | 'handover' | 'hr' | 'other'
}

export const ONBOARDING_TEMPLATE: LifecycleTemplateItem[] = [
  { title: '建立 Microsoft 365 / AAD 帳號', category: 'account' },
  { title: '建立 myOPS 帳號並設定部門與主管', category: 'account' },
  { title: '加入 Teams 團隊與群組', category: 'account' },
  { title: '發放筆電與周邊設備（登記資產保管人）', category: 'equipment' },
  { title: '門禁卡 / 鑰匙發放', category: 'access' },
  { title: '指派 myOPS 功能權限（granted features / job role）', category: 'access' },
  { title: '勞健保加保、薪資資料建檔', category: 'hr' },
  { title: '指派必修教育訓練（GCP / 生安等）', category: 'hr' },
  { title: '假勤制度與內部規章說明（閱讀確認）', category: 'hr' },
  { title: '部門介紹與職務交接說明', category: 'handover' },
]

export const OFFBOARDING_TEMPLATE: LifecycleTemplateItem[] = [
  { title: '工作交接文件完成並確認', category: 'handover' },
  { title: '歸還筆電與周邊設備（資產歸還登記）', category: 'equipment' },
  { title: '歸還門禁卡 / 鑰匙', category: 'access' },
  { title: '移除 myOPS 權限並停用帳號（offboarding）', category: 'account' },
  { title: '停用 Microsoft 365 / AAD 帳號、信箱轉接', category: 'account' },
  { title: '移出 Teams 團隊與共用資料夾', category: 'access' },
  { title: '勞健保退保、最後薪資與未休假結算', category: 'hr' },
  { title: '公司文件與智財歸還確認（NDA 提醒）', category: 'handover' },
]
