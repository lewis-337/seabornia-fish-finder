# Seabornia Fish Finder v4 | iPhone / Mac

## 使い方
`index.html` を開くと、魚種検索、写真付き図鑑、月別釣果、海域マップ、マイ航海・記録を使えます。GPS・最新釣果の取得・公開GEBCO海底地形にはHTTPSと通信が必要です。端末の位置情報を許可してください。

- 地図は釣果地点ではなく海域の**概略代表位置**です。GPS点とは異なります。各番号をタップすると名称と詳細を表示。固定ラベルの重なりを避けています。
- 「✚」モードでは概略地図をタップして自分のポイントを保存可能。厳密な実測点ではありません。GPSマークでは端末の現在地と推定精度を確認してから保存してください。
- マイ航海でポイントと釣果（写真は縮小）を**端末localStorage**に保存。JSONバックアップ、JSONインポート、釣果CSVエクスポートに対応。共有、クラウド同期は未搭載。ブラウザデータ消去で消えるためバックアップが必要です。
- 魚種写真はWikimedia/Wikipediaの画像URLを複数手段で取得し、実際の画像ロード成功で表示を検証します。「全画像をチェック」で全件を診断できます。ネットがない場合は写真未取得と表示。**全画像が出ることを現時点で保証するものではありません。** Wikipedia/Wikimediaの著作権表記は元ファイル参照。
- 「GEBCO海底図」はGEBCO 2026 の WMS 海底陰影データを表示。**砂地・岩礁の調査結果ではなく、航海に使えません。** 2026 grid 15秒角なので小さなかけ上がりは捉えられない場合があります。 https://www.gebco.net/data-products/gebco-web-services/web-map-service
- 一部に過去の釣果や公開ソースの再編集があります。2026年10月18日頃の実績は個別ページで確認していますが、将来の釣果を予言しません。
- HTTPS公開後 `data/latest.json` を収集スクリプトが更新する設計。GitHub PagesとActionsの設定が必要であり、**稼働成功はまだ確認していません。** SNS自動収集は対象外です。

## 公開
GitHubでリポジトリを作成しこのフォルダの内容をmainブランチのルートにコミット、Settings > Pages > Build and deployment をGitHub Actionsに設定。Workflow permissionsで Contents write を許可してください。6時間おきのworkflowの初回成功を確認してください。

## 出典
- 諸磯光二丸の実釣一覧 https://www.mitsuzimaru.com/catch/
- 長井海力丸の公開実績 https://reserve.castingnet.jp/ship01470c.html
- シイラの釣割エリア実績 https://www.chowari.jp/catcharea/?area=57&fish=191
- GEBCO 2026 https://www.gebco.net/data-products/gridded-bathymetry-data

Photo caching (GitHub Actions): `scripts/cache_fish_photos.py` downloads Commons previews that include a reuse license and decodes each file with Pillow. Files are hosted inside the PWA and credited in `data/photo_manifest.json`. On failure the fish remains in the catalogue with a failure state; there is no fabricated substitute photo.

## このリポジトリのセットアップ
- 公開URL: https://lewis-337.github.io/seabornia-fish-finder/
- iPhone: SafariでURLを開き、共有メニューから「ホーム画面に追加」を選びます。
- GitHub PagesはActions方式。釣果収集は6時間ごと（日本時間03:17・09:17・15:17・21:17）の予定実行と、mainへのアプリ変更時に実行します。実際の開始はGitHub側の状況で遅れることがあります。
- データ更新の実績は画面の最終成功日時とActionsの実行結果で確認してください。写真の欠損は取得状況に応じて表示されます。
- 開発・引継ぎ: `PROGRESS.md`。依存関係は`requirements.txt`、公開ファイルの生成は`python scripts/build_site.py`です。

写真の補足: Commonsの代表画像が料理写真または別種の画像になる項目は、確認済みiNaturalistのCC BY写真を`data/photo_overrides.json`に指定しています。出典・撮影者・ライセンスと縮小/JPEG変換を魚種の詳細画面に表示します。
