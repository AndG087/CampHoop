import { request } from './client'
export type Notification = { id: string; title: string; body: string; href: string; createdAt: string; readAt: string | null }
export type NotificationPage = { items: Notification[]; unread: number; nextCursor: string | null }
export const listNotifications = (unread = false, cursor?: string) => request<NotificationPage>(`/notifications?unread=${unread}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
export const notificationCount = () => request<{ unread: number }>('/notifications/summary')
export async function readNotification(id: string) { await request(`/notifications/${id}/read`, 'PUT'); window.dispatchEvent(new Event('camphoop:notifications')) }
export async function readAllNotifications() { await request('/notifications/read-all', 'PUT'); window.dispatchEvent(new Event('camphoop:notifications')) }
