# hy

AI 项目骨架仓库。

## 目录结构

| 路径 | 用途 |
|---|---|
| `src/` | 训练、推理、评估代码 |
| `configs/` | 实验配置（yaml），每次实验的配置都要入库 |
| `scripts/` | 数据预处理、训练、评估的入口脚本 |
| `tests/` | 单测，至少覆盖数据管道和指标计算 |
| `notebooks/` | 探索用，提交前用 `nbstripout` 清空输出 |
| `data/` | 本地数据目录，内容不入库 |
| `checkpoints/` | 本地权重目录，内容不入库 |
| `.env.example` | 环境变量模板，复制为 `.env` 后填值 |

## 数据与权重放在哪

**不进 git。** 放 HuggingFace Hub、对象存储或共享盘，仓库里只放路径和下载脚本。
单文件超过 100 MB 时 git 会拒绝，历史上传过的文件也无法真正删除。

## 协作约定（两人版）

- 各用各的 GitHub 账号和 PAT，不共用。
- **不直推 `main`**：拉分支 → 小步提交 → push → 开 PR → 对方看过再合。
- 每次实验的 config 必须入库，结果指标写在 PR 描述里，保证分数可比。
- 依赖要锁版本（`uv.lock` / `poetry.lock` 入库）。

日常循环：

```bash
git pull --rebase
git switch -c feature/xxx
# 改代码
git add -A && git commit -m "..."
git push -u origin feature/xxx
```

## 下一步

1. 补 `requirements.txt` 或 `pyproject.toml`，锁定依赖版本。
2. 把 `data/`、`checkpoints/` 指向真实数据位置（或加下载脚本）。
3. 每人本地 `cp .env.example .env` 并填入自己的密钥。
