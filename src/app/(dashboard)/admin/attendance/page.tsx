import { redirect } from 'next/navigation'

// 「打卡紀錄管理」已整併進打卡頁的「全員紀錄」分頁，
// 這頁只留轉址讓舊連結／書籤／Teams 通知繼續可用。
export default function AdminAttendancePage() {
  redirect('/attendance?tab=all')
}
