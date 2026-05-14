import os from 'os'

export const getLocalIpAddress = () => {
  const interfaces = os.networkInterfaces()

  const allInterfaces = Object.entries(interfaces).flatMap(([name, ifaces]) =>
    (ifaces || []).map((iface) => ({ name, ...iface })),
  )

  const validInterfaces = allInterfaces.filter(
    (i) => i.family === 'IPv4' && !i.internal,
  )

  const isVirtual = (name: string) => {
    const n = name.toLowerCase()
    return (
      n.includes('vmware') ||
      n.includes('virtual') ||
      n.includes('vethernet') ||
      n.includes('wsl') ||
      n.includes('vpn') ||
      n.includes('tailscale') ||
      n.includes('zerotier')
    )
  }

  const isLocal = (ip: string) =>
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)

  const physicalInterfaces = validInterfaces.filter((i) => !isVirtual(i.name))

  const bestMatch =
    physicalInterfaces.find((i) => isLocal(i.address)) ||
    validInterfaces.find((i) => isLocal(i.address)) ||
    physicalInterfaces[0] ||
    validInterfaces[0]

  return bestMatch?.address || null
}
