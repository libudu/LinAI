import {
  getMemberHistory,
  removeMemberHistory,
} from '../../interconnect/members'
import { getEagleSharingSettings } from '../settings'

/** 换邀请码后仍按稳定权限键读取历史，同时兼容旧房间记录。 */
export async function getSharingGroupCodes(groupId: string) {
  const { users } = await getEagleSharingSettings()
  const user = users.find(
    (entry) =>
      entry.invitationCode === groupId || entry.folderSharingCode === groupId,
  )
  return new Set(
    user
      ? [user.invitationCode, user.folderSharingCode ?? user.invitationCode]
      : [groupId],
  )
}

export async function getSharingHistory(groupId: string) {
  const codes = await getSharingGroupCodes(groupId)
  const history = (await getMemberHistory())
    .filter((entry) => codes.has(entry.groupId))
    .sort((a, b) => b.lastLoginAt - a.lastLoginAt)
  const seen = new Set<string>()
  return history.filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

export async function deleteSharingHistory(groupId: string, userId: string) {
  await removeMemberHistory([...(await getSharingGroupCodes(groupId))], userId)
}
