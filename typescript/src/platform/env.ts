/** Reads one environment variable; a missing variable without a fallback stops the boot instead of failing later. */
export const env = (key: string, fallback?: string): string => {
    const value = process.env[key]
    if (value !== undefined && value !== "") return value
    if (fallback !== undefined) return fallback
    throw new Error(`missing environment variable ${key}`)
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
