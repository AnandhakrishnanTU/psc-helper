// Manage links for alerts created on this device, so users can find them again without email
const KEY = 'psc-helper-alerts'

export interface DeviceAlert {
  token: string
  label: string
}

export function getDeviceAlerts(): DeviceAlert[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function addDeviceAlert(alert: DeviceAlert) {
  const others = getDeviceAlerts().filter(a => a.token !== alert.token)
  localStorage.setItem(KEY, JSON.stringify([...others, alert]))
}

export function removeDeviceAlert(token: string) {
  localStorage.setItem(KEY, JSON.stringify(getDeviceAlerts().filter(a => a.token !== token)))
}
