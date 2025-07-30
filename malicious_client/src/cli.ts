import chalk from 'chalk';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import { OptimisticACKAttacker, AttackConfig } from './OptimisticACKAttacker';

export class AttackCLI {
  private attacker: OptimisticACKAttacker | null = null;

  public async start(): Promise<void> {
    console.log(chalk.red.bold('\n🔥 OPTIMISTIC ACK ATTACK TOOL 🔥\n'));
    console.log(chalk.yellow('⚠️  Educational Purpose Only - Use Responsibly ⚠️\n'));

    while (true) {
      const action = await this.getMainAction();
      
      switch (action) {
        case 'configure_attack':
          await this.configureAndExecuteAttack();
          break;
        case 'exit':
          console.log(chalk.cyan('\n👋 Goodbye!\n'));
          process.exit(0);
      }
    }
  }

  private async getMainAction(): Promise<string> {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          {
            name: '⚔️  Configure & Execute Attack',
            value: 'configure_attack'
          },
          {
            name: '🚪 Exit',
            value: 'exit'
          }
        ]
      }
    ]);
    
    return action;
  }

  private async configureAndExecuteAttack(): Promise<void> {
    console.log(chalk.cyan('\n📋 Configure Attack Parameters:\n'));
    
    const config = await this.getAttackConfig();
    await this.executeAttack(config);
  }

  private async getAttackConfig(): Promise<AttackConfig> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'targetHost',
        message: 'Target Host:',
        default: '127.0.0.1',
        validate: (input) => input.length > 0 || 'Host is required'
      },
      {
        type: 'number',
        name: 'targetPort',
        message: 'Target Port:',
        default: 3001,
        validate: (input) => (input > 0 && input <= 65535) || 'Port must be between 1-65535'
      },
      {
        type: 'confirm',
        name: 'enableTransfer',
        message: 'Enable data transfer during attack (recommended for demonstration)?',
        default: true
      }
    ]);

    // Initialize with default values
    let transferConfig: Partial<AttackConfig> = {
      transferType: 'download',
      transferUrl: undefined,
      streamId: undefined,
      measureSpeed: false
    };

    if (answers.enableTransfer) {
      transferConfig = await inquirer.prompt([
        {
          type: 'list',
          name: 'transferType',
          message: 'Transfer type:',
          choices: [
            { name: '📥 File Download (recommended)', value: 'download' },
            { name: '📺 HLS Video Streaming', value: 'streaming' }
          ],
          default: 'download'
        },
        {
          type: 'input',
          name: 'transferUrl',
          message: 'Download URL (leave empty for auto):',
          default: '',
          when: (answers) => answers.transferType === 'download'
        },
        {
          type: 'input',
          name: 'streamId',
          message: 'Stream ID:',
          default: 'sample-stream',
          when: (answers) => answers.transferType === 'streaming',
          validate: (input) => input.length > 0 || 'Stream ID is required'
        },
        {
          type: 'confirm',
          name: 'measureSpeed',
          message: 'Measure speed improvement (baseline vs attack)?',
          default: true
        }
      ]);
    }

    const advancedConfig = await inquirer.prompt([
      {
        type: 'number',
        name: 'attackDuration',
        message: 'Attack Duration (seconds):',
        default: answers.enableTransfer ? (transferConfig.transferType === 'streaming' ? 120 : 60) : 30,
        validate: (input) => input > 0 || 'Duration must be positive'
      },
      {
        type: 'number',
        name: 'packetInterval',
        message: 'Packet Interval (ms):',
        default: transferConfig.transferType === 'streaming' ? 25 : 50, // Faster for streaming
        validate: (input) => input > 0 || 'Interval must be positive'
      },
      {
        type: 'number',
        name: 'ackAdvanceSize',
        message: 'ACK Advance Size (bytes):',
        default: transferConfig.transferType === 'streaming' ? 17520 : 8760, // 2x for streaming
        validate: (input) => input > 0 || 'Size must be positive'
      },
      {
        type: 'number',
        name: 'windowScale',
        message: 'Window Scale Factor:',
        default: transferConfig.transferType === 'streaming' ? 3.0 : 2.0, // Higher for streaming
        validate: (input) => (input > 0 && input <= 4) || 'Scale should be between 1-4'
      }
    ]);

    return {
      ...answers,
      ...transferConfig,
      ...advancedConfig,
      enableTransfer: answers.enableTransfer,
      measureSpeed: transferConfig.measureSpeed ?? false
    } as AttackConfig;
  }

  private async runQuickDemo(): Promise<void> {
    console.log(chalk.cyan('\n🚀 Starting Quick Demo...\n'));
    
    const demoType = await inquirer.prompt([
      {
        type: 'list',
        name: 'type',
        message: 'Choose demo type:',
        choices: [
          { name: '📥 File Download Demo', value: 'download' },
          { name: '📺 Video Streaming Demo', value: 'streaming' }
        ],
        default: 'download'
      }
    ]);

    let config: AttackConfig;

    if (demoType.type === 'download') {
      config = {
        targetHost: '127.0.0.1',
        targetPort: 3001,
        attackDuration: 45,
        packetInterval: 50,
        ackAdvanceSize: 8760,
        windowScale: 2.0,
        enableTransfer: true,
        transferType: 'download',
        transferUrl: 'http://127.0.0.1:3001/download/xl.dat',
        measureSpeed: true
      };

      console.log(chalk.yellow('File Download Demo Configuration:'));
      console.log(chalk.white(`  Target: ${config.targetHost}:${config.targetPort}`));
      console.log(chalk.white(`  File: ${config.transferUrl}`));
      console.log(chalk.white(`  Duration: ${config.attackDuration}s with speed measurement\n`));
    } else {
      config = {
        targetHost: '127.0.0.1',
        targetPort: 3001,
        attackDuration: 90,
        packetInterval: 25,
        ackAdvanceSize: 17520,
        windowScale: 3.0,
        enableTransfer: true,
        transferType: 'streaming',
        streamId: 'demo-stream',
        measureSpeed: true
      };

      console.log(chalk.yellow('Video Streaming Demo Configuration:'));
      console.log(chalk.white(`  Target: ${config.targetHost}:${config.targetPort}`));
      console.log(chalk.white(`  Stream: ${config.streamId}`));
      console.log(chalk.white(`  Duration: ${config.attackDuration}s with speed measurement\n`));
    }

    await this.executeAttack(config);
  }

  private async executeAttack(config: AttackConfig): Promise<void> {
    try {
      this.attacker = new OptimisticACKAttacker(config);
      
      // Setup interrupt handler
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n⏹️  Attack interrupted by user'));
        this.stopAttack();
      });

      console.log(chalk.green('\n▶️  Starting attack...\n'));
      
      // Show real-time metrics
      const metricsInterval = setInterval(() => {
        this.displayRealTimeMetrics();
      }, 2000);

      await this.attacker.executeAttack();
      
      clearInterval(metricsInterval);
      // console.log(chalk.green('\n✅ Attack completed successfully!\n'));
      
      this.displayFinalResults();
      
    } catch (error) {
      console.error(chalk.red('\n❌ Attack failed:'), error);
    } finally {
      this.attacker = null;
    }
  }

  private displayRealTimeMetrics(): void {
    if (!this.attacker) return;

    const metrics = this.attacker.getMetrics();
    
    // Clear screen and show metrics
    process.stdout.write('\x1Bc'); // Clear screen
    
    console.log(chalk.red.bold('🔥 OPTIMISTIC ACK ATTACK - LIVE METRICS 🔥\n'));
    
    const table = new Table({
      head: ['Attack Metric', 'Value'],
      colWidths: [25, 30]
    });

    // Get transfer type for display
    const transferType = this.attacker.getConfig?.()?.transferType || 'unknown';
    const transferIcon = transferType === 'streaming' ? '📺' : '📥';
    const transferLabel = transferType === 'streaming' ? 'STREAMING' : 'DOWNLOADING';

    table.push(
      ['Status', metrics.transferActive ? chalk.yellow(`${transferIcon} ${transferLabel}`) : (this.attacker.isActive() && metrics.connectionEstablished ? chalk.red('⚔️ ATTACKING') : chalk.gray('⏸️ IDLE'))],
      ['Packets Sent', chalk.cyan(metrics.packetsPressed.toLocaleString())],
      ['Successful ACKs', chalk.green(metrics.successfulAcks.toLocaleString())],
      ['Data Transferred', chalk.blue(this.formatBytes(metrics.totalDataTransferred))],
      ['Current Speed', chalk.magenta(this.formatSpeed(metrics.currentSpeed))],
      ['Transfer Progress', metrics.transferActive ? chalk.yellow(`${metrics.transferProgress.toFixed(1)}%`) : 'N/A'],
      ['Attacker Connection', metrics.connectionEstablished ? chalk.green('✅ ESTABLISHED') : chalk.red('❌ DISCONNECTED')]
    );

    if (metrics.baselineSpeed > 0) {
      table.push(['Baseline Speed', chalk.white(this.formatSpeed(metrics.baselineSpeed))]);
    }
    
    if (metrics.attackSpeed > 0) {
      table.push(['Attack Speed', chalk.white(this.formatSpeed(metrics.attackSpeed))]);
    }
    
    if (metrics.speedImprovement !== 0) {
      const color = metrics.speedImprovement > 0 ? chalk.green : chalk.red;
      table.push(['Speed Improvement', color(`${metrics.speedImprovement > 0 ? '+' : ''}${metrics.speedImprovement.toFixed(1)}%`)]);
    }

    console.log(table.toString());
    console.log(chalk.gray('\nPress Ctrl+C to stop the attack\n'));
  }

  private displayFinalResults(): void {
    if (!this.attacker) return;

    const metrics = this.attacker.getMetrics();
    const duration = (Date.now() - metrics.attackStartTime) / 1000;

    console.log(chalk.cyan('📊 FINAL ATTACK RESULTS:\n'));
    
    const resultsTable = new Table({
      head: ['Metric', 'Value'],
      colWidths: [30, 40]
    });

    resultsTable.push(
      ['Total Duration', `${duration.toFixed(1)} seconds`],
      ['Packets Sent', metrics.packetsPressed.toLocaleString()],
      ['Success Rate', `${((metrics.successfulAcks / metrics.packetsPressed) * 100).toFixed(1)}%`],
      ['Data Transferred', this.formatBytes(metrics.totalDataTransferred)],
      ['Ack Loop Speed', this.formatSpeed(metrics.currentSpeed)]
    );

    if (metrics.baselineSpeed > 0 && metrics.attackSpeed > 0) {
      console.log(chalk.green('\n✅ Attack completed successfully!\n'));
      resultsTable.push(
        ['─────────────────────', '─────────────────────────────────'],
        ['Baseline Speed', this.formatSpeed(metrics.baselineSpeed)],
        ['Attack Speed', this.formatSpeed(metrics.attackSpeed)],
        ['Speed Improvement', `${metrics.speedImprovement > 0 ? '+' : ''}${metrics.speedImprovement.toFixed(1)}%`]
      );

      if (metrics.speedImprovement > 5) {
        resultsTable.push(['Result', chalk.green('🎯 SUCCESSFUL ATTACK!')]);
      } else if (metrics.speedImprovement > 0) {
        resultsTable.push(['Result', chalk.yellow('⚠️ Marginal improvement')]);
      } else {
        resultsTable.push(['Result', chalk.red('❌ No improvement detected')]);
      }
    }
    else{
      console.log(chalk.redBright('\nAttack Stopped Abruptly\n'));
    }

    console.log(resultsTable.toString());
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatSpeed(bytesPerSecond: number): string {
    return this.formatBytes(bytesPerSecond) + '/s';
  }

  private stopAttack(): void {
    if (this.attacker) {
      this.attacker.stopAttack();
      this.displayFinalResults();
      process.exit(0);
    }
  }
}

// Start the CLI
if (require.main === module) {
  const cli = new AttackCLI();
  cli.start().catch(console.error);
}