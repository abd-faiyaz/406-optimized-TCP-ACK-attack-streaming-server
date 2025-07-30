import os from 'os';
import { EventEmitter } from 'events';

export interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
}

export class SystemMonitor extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null;
  private previousCpuInfo: os.CpuInfo[] = [];
  private monitoringInterval: number = 1000; // 1 second

  constructor() {
    super();
    this.previousCpuInfo = os.cpus();
  }

  public start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      const metrics = this.collectMetrics();
      this.emit('metrics', metrics);
    }, this.monitoringInterval);

    console.log('System monitoring started');
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('System monitoring stopped');
    }
  }

  public getMetrics(): SystemMetrics {
    return this.collectMetrics();
  }

  private collectMetrics(): SystemMetrics {
    const cpuUsage = this.calculateCPUUsage();
    const memoryInfo = this.getMemoryInfo();
    const networkInfo = this.getNetworkInfo();

    return {
      timestamp: Date.now(),
      cpu: {
        usage: cpuUsage,
        loadAverage: os.loadavg()
      },
      memory: memoryInfo,
      network: networkInfo
    };
  }

  private calculateCPUUsage(): number {
    const currentCpuInfo = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    currentCpuInfo.forEach((cpu, index) => {
      const prevCpu = this.previousCpuInfo[index];
      if (!prevCpu) return;

      const currentTotal = Object.values(cpu.times).reduce((acc, time) => acc + time, 0);
      const prevTotal = Object.values(prevCpu.times).reduce((acc, time) => acc + time, 0);

      const totalDiff = currentTotal - prevTotal;
      const idleDiff = cpu.times.idle - prevCpu.times.idle;

      totalIdle += idleDiff;
      totalTick += totalDiff;
    });

    this.previousCpuInfo = currentCpuInfo;

    const idle = totalIdle / currentCpuInfo.length;
    const total = totalTick / currentCpuInfo.length;

    return total === 0 ? 0 : 100 - (100 * idle / total);
  }

  private getMemoryInfo() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      total,
      used,
      free,
      percentage: (used / total) * 100
    };
  }

  private getNetworkInfo() {
    // This is a simplified version - in practice, you'd read from /proc/net/dev
    return {
      bytesReceived: 0,
      bytesSent: 0,
      packetsReceived: 0,
      packetsSent: 0
    };
  }
}