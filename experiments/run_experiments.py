"""Orchestrateur de la campagne expérimentale OracleBench-AI (Partie A)."""

import argparse
from pathlib import Path
import sys

# Permet l'exécution directe : python experiments/run_experiments.py
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import yaml

from oraclebench.aggregation import aggregate_all_baselines, aggregate_baseline
from oraclebench.collector import observations_to_dataframe, simulate_round
from oraclebench.generator import generate_ground_truth
from oraclebench.metrics_value import compute_round_error, compute_value_metrics


# --- Stubs temporaires de la Personne B (à remplacer lors de l'intégration) ---
def stub_detect_anomalies(obs_df: pd.DataFrame, history: pd.DataFrame) -> dict[str, float]:
    """Stub de détection d'anomalies : renvoie 0.0 pour chaque oracle."""
    return {str(oid): 0.0 for oid in obs_df["oracle_id"]}


def stub_ai_aggregate(
    obs_df: pd.DataFrame,
    rep: dict,
    scores: dict,
    cfg: dict,
) -> tuple[float, float]:
    """Stub d'agrégation IA : renvoie la médiane et une confiance de 1.0."""
    median_val = aggregate_baseline(obs_df["value"].tolist(), "median")
    return median_val, 1.0


def load_config(config_path: str) -> dict:
    """Charge un fichier de configuration YAML."""
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def run_single_experiment(
    base_cfg: dict,
    n_oracles: int,
    pct_bad: float,
    attack: str,
    seed: int,
) -> tuple[list[dict], list[dict]]:
    """Exécute une expérience complète pour une combinaison de paramètres."""
    exp_cfg = dict(base_cfg)
    exp_cfg["n_oracles"] = int(n_oracles)
    exp_cfg["pct_bad"] = float(pct_bad)
    exp_cfg["attack"] = str(attack)
    exp_cfg["seed"] = int(seed)

    trim_ratio = float(exp_cfg.get("trim_ratio", 0.2))
    truths = generate_ground_truth(exp_cfg, seed)

    state: dict = {}
    history_df = pd.DataFrame()
    reputation: dict = {}

    round_rows: list[dict] = []
    preds_by_method: dict[str, list[float]] = {
        "mean": [],
        "median": [],
        "trimmed": [],
        "ai_stub": [],
    }

    for round_id, truth in enumerate(truths, start=1):
        obs = simulate_round(exp_cfg, round_id, truth, state)
        obs_df = observations_to_dataframe(obs)
        values = obs_df["value"].tolist()

        baselines = aggregate_all_baselines(values, trim_ratio=trim_ratio)
        scores = stub_detect_anomalies(obs_df, history_df)
        ai_val, _ = stub_ai_aggregate(obs_df, reputation, scores, exp_cfg)

        method_values = {**baselines, "ai_stub": ai_val}
        for method, agg_val in method_values.items():
            preds_by_method[method].append(agg_val)
            round_rows.append(
                {
                    "seed": seed,
                    "n_oracles": n_oracles,
                    "pct_bad": pct_bad,
                    "attack": attack,
                    "method": method,
                    "round_id": round_id,
                    "ground_truth": truth,
                    "aggregated_value": agg_val,
                    "error": compute_round_error(truth, agg_val),
                }
            )

        history_df = pd.concat([history_df, obs_df], ignore_index=True)

    summary_rows: list[dict] = []
    for method, preds in preds_by_method.items():
        metrics = compute_value_metrics(truths, preds)
        summary_rows.append(
            {
                "seed": seed,
                "n_oracles": n_oracles,
                "pct_bad": pct_bad,
                "attack": attack,
                "method": method,
                "mae": metrics["mae"],
                "rmse": metrics["rmse"],
                "relative_error_pct": metrics["relative_error_pct"],
            }
        )

    return round_rows, summary_rows


def run_campaign(cfg: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Lance la campagne expérimentale sur toute la grille et exporte les CSV."""
    output_dir = Path(cfg.get("output_dir", "experiments/results"))
    output_dir.mkdir(parents=True, exist_ok=True)

    n_oracles_list = cfg.get("n_oracles_list", [5, 10, 20])
    pct_bad_list = cfg.get("pct_bad_list", [0.0, 0.1, 0.2, 0.3, 0.4, 0.5])
    attacks = cfg.get("attacks", ["none", "spike", "stale", "collusion"])
    seeds = cfg.get("seeds", [42, 43, 44])

    all_rounds: list[dict] = []
    all_summaries: list[dict] = []

    for n_oracles in n_oracles_list:
        for pct_bad in pct_bad_list:
            for attack in attacks:
                for seed in seeds:
                    r_rows, s_rows = run_single_experiment(
                        cfg, n_oracles, pct_bad, attack, seed
                    )
                    all_rounds.extend(r_rows)
                    all_summaries.extend(s_rows)

    rounds_df = pd.DataFrame(all_rounds)
    summary_df = pd.DataFrame(all_summaries)

    rounds_df.to_csv(output_dir / "rounds_results.csv", index=False)
    summary_df.to_csv(output_dir / "summary_metrics.csv", index=False)

    return rounds_df, summary_df


def generate_plots(summary_df: pd.DataFrame, output_dir: str) -> list[str]:
    """Génère les graphiques comparatifs Matplotlib dans ``output_dir``."""
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    generated_files: list[str] = []

    # 1. MAE en fonction du pourcentage d'oracles attaqués (par attaque)
    attack_types = [a for a in summary_df["attack"].unique() if a != "none"]
    if attack_types:
        fig, axes = plt.subplots(1, len(attack_types), figsize=(5 * len(attack_types), 4), sharey=True)
        if len(attack_types) == 1:
            axes = [axes]

        for ax, attack in zip(axes, attack_types):
            sub = summary_df[summary_df["attack"] == attack]
            grouped = sub.groupby(["pct_bad", "method"], as_index=False)["mae"].mean()
            for method, m_df in grouped.groupby("method"):
                ax.plot(m_df["pct_bad"] * 100, m_df["mae"], marker="o", label=method)
            ax.set_title(f"Attaque : {attack}")
            ax.set_xlabel("% d'oracles attaqués")
            ax.set_ylabel("MAE (USD)")
            ax.grid(True, linestyle="--", alpha=0.5)
            ax.legend()

        fig.suptitle("Impact du pourcentage d'oracles attaqués sur la MAE (ETH/USD)")
        fig.tight_layout()
        p1 = out_path / "mae_vs_pct_bad.png"
        fig.savefig(p1, dpi=150)
        plt.close(fig)
        generated_files.append(str(p1))

    # 2. RMSE moyenne par attaque et par méthode
    fig, ax = plt.subplots(figsize=(8, 5))
    pivot_attack = summary_df.groupby(["attack", "method"], as_index=False)["rmse"].mean()
    pivot_table = pivot_attack.pivot(index="attack", columns="method", values="rmse")
    pivot_table.plot(kind="bar", ax=ax)
    ax.set_title("RMSE moyenne par type d'attaque et méthode")
    ax.set_xlabel("Type d'attaque")
    ax.set_ylabel("RMSE (USD)")
    ax.grid(True, axis="y", linestyle="--", alpha=0.5)
    fig.tight_layout()
    p2 = out_path / "rmse_by_attack.png"
    fig.savefig(p2, dpi=150)
    plt.close(fig)
    generated_files.append(str(p2))

    # 3. Impact du nombre d'oracles N sur la RMSE
    fig, ax = plt.subplots(figsize=(7, 5))
    grouped_n = summary_df.groupby(["n_oracles", "method"], as_index=False)["rmse"].mean()
    for method, m_df in grouped_n.groupby("method"):
        ax.plot(m_df["n_oracles"], m_df["rmse"], marker="s", label=method)
    ax.set_title("Impact du nombre d'oracles (N) sur la RMSE")
    ax.set_xlabel("Nombre d'oracles (N)")
    ax.set_ylabel("RMSE moyenne (USD)")
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.legend()
    fig.tight_layout()
    p3 = out_path / "rmse_by_n_oracles.png"
    fig.savefig(p3, dpi=150)
    plt.close(fig)
    generated_files.append(str(p3))

    return generated_files


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Exécute la campagne expérimentale OracleBench-AI (Partie A)."
    )
    parser.add_argument(
        "--config",
        default="experiments/configs/example.yaml",
        help="Chemin vers le fichier de configuration YAML.",
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    output_dir = cfg.get("output_dir", "experiments/results")

    rounds_df, summary_df = run_campaign(cfg)
    plots = generate_plots(summary_df, output_dir)

    print(f"Campagne terminée : {len(rounds_df)} lignes de rounds, {len(summary_df)} résumés.")
    print(f"CSV générés dans : {output_dir}")
    print(f"Graphiques générés : {plots}")


if __name__ == "__main__":
    main()
