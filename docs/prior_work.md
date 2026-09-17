# Prior work for JomJauh + JomRasa

Compiled 2026-09-17. Every reference below was confirmed to exist via web search or by opening the source during this research pass. Where I could only confirm the record (title/authors/venue) but not read the full text, the entry is marked **[record only]**. Where a detail comes from my own background knowledge rather than a page I opened, it is marked **[from memory - verify]**. Nothing here is invented, but page numbers and DOIs should still be re-checked before they go into a final bibliography.

---

## 1. Tourism concentration measurement (Gini / Lorenz / HHI / Theil)

### References

1. **Fernández-Morales, A., Cisneros-Martínez, J. D., & McCabe, S. (2016).** "Seasonal concentration of tourism demand: Decomposition analysis and marketing implications." *Tourism Management*, 56, 172-190. https://www.sciencedirect.com/science/article/abs/pii/S0261517716300541 **[record only]**
   - Gini index of monthly demand, additively decomposed by market segment to get "relative marginal effects" (which segment, if grown by 1%, would reduce concentration). The covariance-based decomposition was introduced to tourism by Fernández-Morales & Mayorga-Toledano (2008).
2. **Lau, P. L., & Koo, T. T. R. (2022).** "Multidimensional decomposition of Gini elasticities to quantify the spatiotemporality of travel and tourism distribution." *Tourism Management*, 88, 104422. DOI 10.1016/j.tourman.2021.104422. https://www.sciencedirect.com/science/article/abs/pii/S0261517721001412 **[record only]**
   - Extends Gini decomposition so that spatial (across destinations) and seasonal (across months) concentration are measured in one additive framework; gives the marginal effect of each region on overall spatial concentration.
3. **Fernandes, P. O., Nunes, A. M., Veloso, C. M., Santos, E., Ferreira, F. A., & Fonseca, M. J. (2020).** "Spatial and Temporal Concentration of Tourism Supply and Demand in Northern Portugal. Application of the Herfindahl-Hirschman Index." In *Advances in Tourism, Technology and Smart Systems* (Smart Innovation, Systems and Technologies, vol. 171), Springer. https://link.springer.com/chapter/10.1007/978-981-15-2024-2_24 **[record only]**
   - HHI (sum of squared shares) across sub-regions for both demand (guests, revenue) and supply (establishments, beds).
4. **Koo, T. T. R., Wu, C.-L., & Dwyer, L. (2012).** "Dispersal of visitors within destinations: Descriptive measures and underlying drivers." *Tourism Management*, 33, 1209-1219. DOI 10.1016/j.tourman.2011.11.010. https://www.sciencedirect.com/science/article/abs/pii/S0261517711002354 **[record only]**
   - Australian International Visitor Survey; defines descriptive dispersal measures and then models their drivers (air access matters more than self-drive).

Supporting note from the search: a 2025/2026 MDPI panel study of Mediterranean NUTS-2 regions describes the Gini as "the most methodologically robust synthetic measure" of concentration in tourism because it is bounded 0-1, unlike CV or Theil whose upper limits depend on the sample (https://www.mdpi.com/2673-5768/7/8/231). The same literature notes that Gini for *seasonal* concentration is routine, while Gini for *spatial* distribution of tourists is less common - so a spatial Gini across Malaysian states is defensible and mildly novel.

### Which index is standard?

- **Gini + Lorenz curve is the default** in tourism concentration work (bounded, interpretable, decomposable). Use it as the headline.
- **HHI** is the standard companion. With n = 16 states the minimum HHI is 1/16 = 0.0625, so report the **normalised HHI** = (HHI - 1/n) / (1 - 1/n), and optionally the "effective number of states" = 1/HHI, which judges will understand immediately.
- **Theil** is only worth adding if you want a between/within decomposition (e.g. Peninsular vs. Borneo, or region groupings). Otherwise skip.

### Weighting by population / area

- The unweighted Gini across 16 states treats Perlis and Selangor as equal-sized units; part of the measured "concentration" is just that states differ in size.
- The regional-science fix is a **relative (locational) Gini / Hoover index**: build the Lorenz curve with cumulative *population share* (or area share) on the x-axis and cumulative *visitor share* on the y-axis, ordering states by visitors-per-capita. Hoover index H = 0.5 * sum |visitor_share_i - pop_share_i| = the share of visitors that would need to move for visits to be proportional to population. Implementations: R `REAT::gini.conc` (https://rdrr.io/cran/REAT/man/gini.conc.html), R `EconGeo::Hoover.Gini` (https://rdrr.io/github/PABalland/EconGeo/man/Hoover.Gini.html).
- The Hoover index has a direct policy reading for the redistribution simulator: "X% of trips would have to be redirected for visits to match population/capacity shares."

### Recommendation

Report three numbers: (a) plain Gini with Lorenz curve, (b) normalised HHI, (c) population-weighted relative Gini or Hoover index. Show before/after values of all three in the what-if simulator so the simulator's effect is expressed in the same units as the diagnosis.

---

## 2. Composite potential / attractiveness / competitiveness indices

### References

1. **OECD & European Commission JRC (Nardo, M., Saisana, M., Saltelli, A., Tarantola, S., Hoffmann, A., Giovannini, E.) (2008).** *Handbook on Constructing Composite Indicators: Methodology and User Guide.* OECD Publishing. ISBN 978-92-64-04345-9. https://www.oecd.org/en/publications/handbook-on-constructing-composite-indicators-methodology-and-user-guide_9789264043466-en.html ; JRC record https://publications.jrc.ec.europa.eu/repository/handle/JRC47008
   - The ten-step checklist: theoretical framework, data selection, imputation, multivariate analysis, normalisation, weighting and aggregation, uncertainty and sensitivity analysis, back to the data, links to other indicators, visualisation.
2. **Saisana, M., Saltelli, A., & Tarantola, S. (2005).** "Uncertainty and sensitivity analysis techniques as tools for the quality assessment of composite indicators." *Journal of the Royal Statistical Society: Series A*, 168(2), 307-323. https://academic.oup.com/jrsssa/article-abstract/168/2/307/7084307
   - Monte Carlo over the methodological choices (normalisation, weights, aggregation, indicator inclusion); output is a distribution of ranks per unit, plus sensitivity indices showing which choice drives rank changes.
3. **Greco, S., Ishizaka, A., Tasiou, M., & Torrisi, G. (2019).** "On the Methodological Framework of Composite Indices: A Review of the Issues of Weighting, Aggregation, and Robustness." *Social Indicators Research*, 141(1), 61-94. DOI 10.1007/s11205-017-1832-9. https://link.springer.com/article/10.1007/s11205-017-1832-9
   - Review of weighting (equal, PCA/FA, DEA/benefit-of-the-doubt, expert/AHP), aggregation (arithmetic = fully compensatory; geometric = partially; non-compensatory multi-criteria) and robustness checks.
4. **World Economic Forum (2024).** *Travel & Tourism Development Index 2024* - methodology. https://www.weforum.org/publications/travel-tourism-development-index-2024/in-full/1-2-data-and-methodology-a926021812/ and Appendix A https://www.weforum.org/publications/travel-tourism-development-index-2024/appendix-a-e8e28f48c4/
   - 102 indicators in 17 pillars; each indicator min-max normalised to a 1-7 scale (using sample min and max); **simple arithmetic mean** at every level (indicator to pillar to index). The five "dimensions" are presentational only. (The WEF technical-notes page returned 403 to my fetch; the summary above is from the WEF overview pages and search excerpts.)
5. **Mazziotta, M., & Pareto, A. (2013).** "Methods for constructing composite indices: One for all or all for one?" *Rivista Italiana di Economia Demografia e Statistica*, 67(2), 67-80. https://www.istat.it/en/files/2013/12/Rivista2013_Mazziotta_Pareto.pdf
   - No universal method; introduces the Mazziotta-Pareto Index (z-score based, penalises unbalanced profiles) as a partially non-compensatory alternative.

Conceptual grounding for the pillars:
- **Buhalis, D. (2000).** "Marketing the competitive destination of the future." *Tourism Management*, 21(1), 97-116. The "six As": Attractions, Accessibility, Amenities, Available packages, Activities, Ancillary services. Your Access / Awareness / Amenities pillars map onto Accessibility / (marketing & available packages) / Amenities - cite this so the three pillars are not ad hoc.
- **Dwyer, L., & Kim, C. (2003).** "Destination competitiveness: Determinants and indicators." *Current Issues in Tourism*, 6(5), 369-414. DOI 10.1080/13683500308667962. Indicator menu for endowed resources, created resources, supporting factors, destination management, demand conditions.
- UNDP HDI 2010 switch from arithmetic to geometric mean (imperfect substitutability between dimensions): https://hdr.undp.org/content/improving-measurement-human-development ; research paper https://hdr.undp.org/system/files/documents/hdrp201012.pdf

Tooling: **COINr** (Becker, Caperna, Del Sorbo, Norlén, Papadimitriou, Saisana 2022, *JOSS* 7(78), 4567, https://joss.theoj.org/papers/10.21105/joss.04567 , docs https://bluefoxr.github.io/COINr/) is the JRC-lineage R package; useful as a reference implementation of the uncertainty/sensitivity workflow even if you re-implement in Python.

### What is most defensible for 16 units and 6-10 indicators?

| Step | Recommendation | Why |
|---|---|---|
| Pre-treatment | Put every indicator on a per-capita, per-km2 or rate basis first. Check skew; for skewed indicators (anything where KL/Selangor are outliers) winsorise or log-transform before normalising. | Min-max is very sensitive to a single extreme unit (OECD/JRC Handbook); with 16 units one outlier squashes the other 15 into a narrow band. |
| Normalisation | **Min-max to 0-100** as the headline (same family as WEF TTDI, easy to explain on a dashboard). Run **z-score** as a sensitivity variant. | Both are Handbook-standard. Min-max gives bounded, readable scores; z-scores handle outliers slightly better. |
| Weighting | **Equal weights within pillar, equal weights across pillars** (hierarchical). Use correlation matrix / PCA only as a *diagnostic* (are two indicators measuring the same thing? is one negatively correlated with the rest?). | PCA-derived weights with n = 16 and p = 6-10 are statistically unstable (ratio of observations to variables far too low) and PCA weights reflect correlation, not importance (Greco et al. 2019; Handbook). WEF also uses simple averages. |
| Aggregation | Arithmetic mean within a pillar; report **geometric mean across pillars as a variant** (or as headline if you want the index to say "a state cannot compensate for no access with a lot of amenities"). Geometric needs strictly positive scores - rescale to 1-100, not 0-100. | UNDP HDI rationale; Greco et al. (2019) on compensability. It also fits your bottleneck narrative: weakest pillar should drag the score. |
| Robustness | **Monte Carlo weight perturbation**: draw weights from a Dirichlet (e.g. alpha = 1 for fully random, or alpha chosen so weights vary +/-25% around equal), 5,000 draws, crossed with normalisation in {min-max, z-score} and aggregation in {arithmetic, geometric}. For each state report median rank and 5th-95th percentile rank; report **Spearman rank correlation** of each draw against the baseline ranking (median and minimum). Add **leave-one-indicator-out** rank shifts. | This is the Saisana-Saltelli-Tarantola (2005) procedure in a form you can compute in seconds for 16 units. A dashboard chart of rank intervals is a strong credibility signal for judges. |

---

## 3. Tourism carrying capacity and intensity indicators

### References

1. **Cifuentes, M. (1992).** *Determinación de capacidad de carga turística en áreas protegidas.* CATIE, Turrialba, Costa Rica. Verified via the review: **"A Review on Tourism Carrying Capacity Assessment and a Proposal for Its Application on Geological Sites"** (2023), *Geoheritage*, https://link.springer.com/article/10.1007/s12371-023-00810-3 , which describes it as the most widely used and adapted approach.
   - Three nested levels: Physical Carrying Capacity (space x rotation), Real Carrying Capacity (PCC reduced by correction factors), Effective Carrying Capacity (RCC x management capacity). PCC >= RCC >= ECC.
2. **Eurostat - Glossary: Tourism intensity.** https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Glossary:Tourism_intensity ; regional usage in https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Tourism_statistics_-_seasonality_at_regional_level
   - **Tourism intensity** = nights spent at tourist accommodation per 1,000 inhabitants. **Tourism density** = nights spent per km2. These are the official EU pressure indicators.
3. **European Commission (2016).** *The European Tourism Indicator System (ETIS) toolkit for sustainable destination management.* https://ec.europa.eu/docsroom/documents/21749
   - 27 core + 40 optional indicators (per the search summary). Relevant ones: tourist nights per month (B.1.1), average length of stay (B.2.1), occupancy rate in commercial accommodation per month and annual average (B.2.2), beds available in commercial accommodation per 100 residents (C.1.1.2).
4. **Defert's tourist function index (Defert 1967; Baretje-Defert)** = (tourist beds / resident population) x 100; and **Charvat's index** = overnight stays per 100 residents. Verified via the secondary source "Population Situation vs. Tourist Function in Lower Silesia" (2025), *Sustainability*, DOI 10.3390/su17104265, https://doi.org/10.3390/su17104265 . Boyer's classes run from TF <= 4 (practically no tourism) to TF > 500 (hyper-touristic).
5. **McElroy, J. L., & de Albuquerque, K. (1998).** "Tourism penetration index in small Caribbean islands." *Annals of Tourism Research*, 25(1), 145-168. https://sciencedirect.com/science/article/pii/S0160738397000686 **[record only; year/pages from memory - verify]**
   - A composite **Tourism Penetration Index** built from exactly three sub-indicators: per-capita visitor spending, average daily visitor density per 1,000 population, hotel rooms per km2. This is the closest published analogue to your "Actual tourism intensity" index.
6. **Peeters, P., Gössling, S., Klijs, J., et al. (2018).** *Research for TRAN Committee - Overtourism: impact and possible policy responses.* European Parliament, IPOL_STU(2018)629184. https://www.europarl.europa.eu/thinktank/en/document/IPOL_STU(2018)629184
   - Uses tourism density (bed-nights per km2) and tourism intensity (bed-nights per resident), plus Airbnb share, air-transport share and GDP share to flag 53 EU regions facing overtourism and 15 at high risk; concludes no universal threshold exists.

### Is there a defensible "target occupancy"?

I did **not** find a peer-reviewed paper that states a canonical target occupancy. What I did find:

- **Break-even** is far below any target: HotStats data (Eisen & Resco, 13 May 2020, https://www.hotstats.com/blog/analysis-at-what-occupancy-rate-can-a-hotel-break-even) put break-even occupancy at 37.3% for US hotels overall, 26.3% for APAC luxury and roughly 8 points higher for APAC full-service/select-service.
- Industry (non-academic) commentary clusters around **70-80%** as the sustainable annual range, with operational strain and diminishing profit margins above about 80-85% (CoStar "Peak Profitability: Finding Balance of Occupancy, Rate", https://www.costar.com/article/1464145850/peak-profitability-finding-balance-of-occupancy-rate - the page blocked my fetch, so I could not confirm its exact figures; treat as indicative only).
- **Malaysian reality check**: the national average occupancy rate was 58.5% in Sept 2019 (CEIC, https://www.ceicdata.com/en/malaysia/hotel-room-occupancy-rate), 46.7% in 2022 (Statista), and 54.4% for Jan-Sep 2024 vs 51.6% a year earlier (Tourism Malaysia Paid Accommodation Survey, https://data.tourism.gov.my/frontend/pdf/Infographic_paid_accommodation_performance_jan-%20sept_2024.pdf). State-level AOR tables: https://mytourismdata.tourism.gov.my/wp-content/uploads/2024/01/AOR-Jan-September-by-State-2023.pdf

**Recommendation:** do not hard-code one number. Make target occupancy a slider with **default 70%**, and offer an empirical alternative: "best observed Malaysian state AOR" (a benchmark that has demonstrably been achieved domestically). Show how the redistributable volume changes between 65%, 70% and 75% - that is your sensitivity analysis for the simulator. State plainly in the methodology note that 70% is an industry convention, not a literature-derived constant.

**How to use Cifuentes:** it is a site-level (trails, caves, protected areas) method; applying PCC formulas to a whole state is not defensible. Borrow only the *logic* as framing: rooms x days = physical capacity; x target occupancy = real capacity; minus current occupied room-nights = effective spare capacity.

---

## 4. Overtourism / dispersal policy and Malaysian multipliers

### Dispersal literature

1. **UNWTO; CELTH; Breda University; NHL Stenden (2018).** *'Overtourism'? - Understanding and Managing Urban Tourism Growth beyond Perceptions.* DOI 10.18111/9789284419999. https://www.e-unwto.org/doi/book/10.18111/9789284419999 . Volume 2: Case Studies (2019), DOI 10.18111/9789284420629.
   - 11 strategies and 68 measures. Strategy 1 is "Promote the dispersal of visitors within the city and beyond", strategy 2 time-based dispersal, strategy 3 new itineraries and attractions. This is the citation for *why* a dispersal simulator is policy-relevant.
2. **Koens, K., Postma, A., & Papp, B. (2018).** "Is Overtourism Overused? Understanding the Impact of Tourism in a City Context." *Sustainability*, 10(12), 4384. https://www.mdpi.com/2071-1050/10/12/4384
   - 80 stakeholders in 13 European cities; overtourism is multidimensional and not reducible to visitor counts. Use to justify showing pressure indicators next to raw arrivals.
3. **Zuckerman Farkash, M., Birenboim, A., Fleischer, A., & Ben-Nun Bloom, P. (2023).** "Can local tours disperse tourists from city centres?" *Current Issues in Tourism.* https://www.tandfonline.com/doi/full/10.1080/13683500.2023.2218607
   - Discrete choice experiment; "soft" dispersal interventions shift only some segments and are unlikely to change behaviour substantially; effective dispersal needs real attractions and amenities at the receiving end. **This is the honest caveat for your simulator**: a redistribution scenario is an upper bound, not a forecast, and it supports tying the simulator to the bottleneck pillars (fix Access/Amenities first).
4. Koo, Wu & Dwyer (2012) (see section 1): in Australia, dispersal is driven mainly by air access and long-distance transport - evidence that the **Access** pillar is the binding constraint for dispersal.

### Malaysian multipliers and TSA - actual numbers

**Mazumder, M. N. H., Ahmed, E. M., & Al-Amin, A. Q. (2009).** "Does Tourism Contribute Significantly to the Malaysian Economy? Multiplier Analysis Using I-O Technique." *International Journal of Business and Management*, 4(7), 146-159. DOI 10.5539/ijbm.v4n7p146. https://www.ccsenet.org/journal/index.php/ijbm/article/view/3079 (open-access PDF; I extracted the tables directly). Based on the Malaysian 2000 Input-Output table (94 sectors, aggregated), closed model, inbound tourist expenditure.

Table 1 of the paper - tourism-average "normal" multipliers per RM1 of tourist spending:

| Multiplier | Direct | Indirect | Induced | **Total** | Type I ratio | Type II ratio |
|---|---|---|---|---|---|---|
| Output | 0.216 | 1.136 | 0.066 | **1.419** | 6.26 | 6.56 |
| Household income | 0.274 | 0.067 | 0.014 | **0.355** | 1.24 | 1.29 |
| Employment | 0.125 | 0.040 | 0.009 | **0.174** | 1.32 | 1.39 |
| Value added | 0.386 | 0.141 | 0.034 | **0.561** | 1.37 | 1.45 |
| Import (leakage) | 0.158 | 0.052 | 0.010 | **0.220** | 1.33 | 1.39 |

Table 2 - total output multiplier by tourism sector: Food & beverage **1.82**, Accommodation **1.44**, Tour & transport **1.41**, Miscellaneous services 1.36, Entertainment 1.28, Shopping **1.20**. From the text: value-added multiplier is highest for shopping (0.78) and lowest for miscellaneous services (0.31); import multiplier ranges from 0.09 (entertainment) to 0.33 (tour & transport).

So a defensible **range is about 1.2-1.8 for output, about 0.56 for value added, about 0.35 for household income, with about 22 sen per ringgit leaking to imports**.

Other Malaysian sources:
- **Mazumder, M. N. H., Su, Z., Bhuiyan, A. B., Rashid, M., & Al-Mamun, A. (2017).** "Economy-wide Impact of Tourism in Malaysia: An Input-output Analysis." *Tourism Analysis*, 22(3). https://www.ingentaconnect.com/content/cog/ta/2017/00000022/00000003/art00012 **[record only]** - closed I-O model, 52 sectors; search excerpts report hotels & restaurants with the highest income multiplier (0.848) and an economy-wide average sectoral output multiplier of 2.11. I could not open the full text, so do not quote these two figures without checking.
- **Mohd Nor, N. A., Mohd Salleh, N. H., & Falatehan, A. F. (2021).** "The Effect of Tourism Expenditure on the Economy: A New Evidence." *Jurnal Ekonomi Malaysia*, 55(3), 23-34. DOI 10.17576/JEM-2021-5503-02. https://ideas.repec.org/a/ukm/jlekon/v55y2021i3p23-34.html - SAM-based; arts/entertainment/recreation yields the largest output multiplier; notes urban-rural income distribution effects (relevant to the dispersal argument).
- **Rashidah binti Abdullah (2012).** *The Economic Impact of Tourism in Malaysia: An Input Output Analysis.* Master of Economics thesis, Universiti Utara Malaysia. https://etd.uum.edu.my/3552/ - uses the DOSM 2005 I-O table, 21 sectors (only front matter is public).
- **DOSM Tourism Satellite Account 2023** (https://www.dosm.gov.my/portal-main/release-content/tourism-satellite-account-2023): tourism industries' gross value added RM275.8 billion = **15.1% of GDP** (13.9% in 2022); internal tourism expenditure RM154.5 billion, of which **domestic 50.9% (RM78.7 bn)** and inbound 49.1% (RM75.8 bn); 3.4 million persons employed in tourism industries. TSA 2024 PDF: https://statistics.gov.my/uploads/release-content/file_20250912095313.pdf
- **DOSM Domestic Tourism Survey 2024** (https://www.dosm.gov.my/portal-main/release-content/domestic-tourism-survey-2024 ; state tables https://www.dosm.gov.my/portal-main/release-content/domestic-tourism-survey-states-2024): 260.1 million domestic visitor arrivals (+21.7%), RM106.7 bn spending; Selangor 34.5 m visitors / RM14.2 bn, KL 27.0 m / RM14.1 bn, Perak 21.8 m. Spending mix: shopping 37.4%, F&B 16.2%, automotive fuel 12.7%.
- **DOSM Malaysia Input-Output Tables 2021** exist (https://www.dosm.gov.my/portal-main/release-content/malaysia-input-output-tables-2021) if you want to compute an up-to-date multiplier yourself.

### Recommendation

In the simulator, convert redistributed visitors to ringgit using **state-level DTS spend per visitor**, then apply an output multiplier shown as a **range of 1.2-1.8 (central 1.4)** citing Mazumder et al. (2009), with value added ~0.56. Two caveats to print next to it: (i) these are *national* multipliers from a 2000 I-O table for *inbound* spending - state-level multipliers are smaller because of inter-state leakage; (ii) redistribution between states is approximately **zero-sum nationally** - the gain is distributional (regional equity, congestion relief), not extra GDP, unless the scenario adds trips. Because domestic spending is 37% shopping (output multiplier 1.20, the lowest), a spend-mix-weighted multiplier will sit toward the low end of the range.

---

## 5. Malay / multilingual / code-switched sentiment and emotion; LLM zero-shot evidence

### Malaysian resources

1. **Malaya** (mesolitica; docs https://malaya.readthedocs.io/ , code https://github.com/mesolitica/malaya).
   - Sentiment: `mesolitica/sentiment-analysis-nanot5-small-malaysian-cased` (167 MB) and `-tiny-` (93 MB); 3 labels (negative/neutral/positive); trained on `mesolitica/chatgpt-explain-sentiment`; reported macro-F1 only **0.67-0.68** (https://malaya.readthedocs.io/en/latest/load-sentiment.html). Note the training labels are themselves ChatGPT-generated.
   - Emotion: `mesolitica/emotion-analysis-nanot5-small-malaysian-cased` / `-base-`; **six labels: anger, fear, happy, love, sadness, surprise**; reported macro-F1 0.97-0.98 on its own test split; trained on standard + social-media Malay (https://malaya.readthedocs.io/en/stable/load-emotion.html). The very high score reflects an in-distribution split, not travel text.
2. `malaysia-ai/malay-sentiment-deberta-xsmall` (binary Malay sentiment, https://huggingface.co/malaysia-ai/malay-sentiment-deberta-xsmall) and the **malaysian-dataset** corpus collection (https://github.com/mesolitica/malaysian-dataset , sentiment folder documented at https://malaysian-dataset.readthedocs.io/en/latest/sentiment.html), including a supervised Bahasa Twitter sentiment set.
3. **Code-mixed datasets** (Data in Brief): "Annotated dataset for sentiment analysis and sarcasm detection: Bilingual code-mixed English-Malay social media data in the public security domain" (2024), 10,000 comments (3,072 pos / 4,197 neg / 2,569 neutral), https://www.sciencedirect.com/science/article/pii/S2352340924006309 ; and "A bi-annotated Malay-English code-switching (Manglish) dataset of X posts..." (2024), 650k posts (author attribution, not sentiment), https://www.sciencedirect.com/science/article/pii/S2352340924000088
4. Regional benchmarks: **SEACrowd** (https://arxiv.org/abs/2406.10118) and **SEA-HELM** (ACL Findings 2025, https://aclanthology.org/2025.findings-acl.636/). SEA-HELM does not currently cover Malay; SEACrowd reports that LLM *generation* in Malay is judged natural only ~22% of the time - a reason to have the LLM output **labels in English** and any user-facing Malay text templated or reviewed.

### LLM zero-shot vs fine-tuned - evidence

1. **Zhang, W., Deng, Y., Liu, B., Pan, S. J., & Bing, L. (2024).** "Sentiment Analysis in the Era of Large Language Models: A Reality Check." *Findings of NAACL 2024*, 3881-3906. https://aclanthology.org/2024.findings-naacl.246/ (code https://github.com/DAMO-NLP-SG/LLM-Sentiment)
   - 13 tasks, 26 datasets. LLMs are satisfactory zero-shot on simple polarity classification, **lag fine-tuned small models on structured tasks such as ABSA**, and beat small models when only few-shot data exist.
2. **Wu, C., Ma, B., Zhang, Z., Deng, N., He, Y., & Xue, Y. (2025).** "Evaluating Zero-Shot Multilingual Aspect-Based Sentiment Analysis with Large Language Models." *International Journal of Machine Learning and Cybernetics* (arXiv 2412.12564). https://arxiv.org/abs/2412.12564
   - Nine LLMs, several prompting strategies. LLMs fall short of fine-tuned models on multilingual ABSA; **plain zero-shot prompts often beat chain-of-thought / self-debate / self-consistency**, especially in high-resource languages.
3. **Wang, Z., et al. (2023).** "Is ChatGPT a Good Sentiment Analyzer? A Preliminary Study." arXiv 2304.04339. https://arxiv.org/abs/2304.04339 (code https://github.com/NUSTM/ChatGPT-Sentiment-Evaluation)
   - Zero-shot ChatGPT rivals fine-tuned BERT on polarity classification, is weaker on end-to-end ABSA extraction and on social-media/less common domains; few-shot prompting closes much of the gap.
4. **Wang, K., Jing, Z., Su, Y., & Han, Y. (2024).** "Large Language Models on Fine-grained Emotion Detection Dataset with Data Augmentation and Transfer Learning." arXiv 2403.06108. https://arxiv.org/abs/2403.06108 - together with the related search findings: zero-shot GPT-4 is well below fine-tuned BERT/RoBERTa on the 27-way GoEmotions task and sometimes emits labels outside the allowed set. Fine-grained emotion is where zero-shot LLMs are weakest.
5. **Koto, F., et al. (2024).** "Zero-shot Sentiment Analysis in Low-Resource Languages Using a Multilingual Sentiment Lexicon." *EACL 2024.* https://aclanthology.org/2024.eacl-long.18/ - covers 34 languages and 3 code-switching sets; lexicon-pretrained models beat GPT-3.5/BLOOMZ/XGLM zero-shot in many low-resource and code-switched settings.

### Emotion taxonomy

- **Demszky, D., et al. (2020).** "GoEmotions: A Dataset of Fine-Grained Emotions." *ACL 2020.* https://aclanthology.org/2020.acl-main.372/ - 58k Reddit comments, 27 emotions + neutral, and importantly an **official mapping down to Ekman's 6 (anger, disgust, fear, joy, sadness, surprise) + neutral**, and to a 3-way sentiment grouping.
- **SemEval-2025 Task 11 / BRIGHTER** (https://arxiv.org/abs/2503.07269): 28 languages, ~100k instances, multi-label **anger, disgust, fear, joy, sadness, surprise + neutral**, with 0-3 intensity. This is the current multilingual standard and it is again Ekman-6.

**Recommendation on taxonomy:** use **Ekman-6 + neutral** as the base (it is what both GoEmotions-reduced and BRIGHTER use, and it nearly matches Malaya's six labels, which lets you cross-check the LLM against Malaya on Malay text). Add at most two tourism-specific labels if pilots show they are frequent - **trust/relief** (safety, hospitality) and **anticipation/excitement** (from Plutchik) - but keep the set at 8 or fewer. Do not use the full 27: the evidence above says zero-shot LLMs are unreliable at that granularity. Allow multi-label with a 0-3 intensity as BRIGHTER does.

**Recommendation on method:**
- Use the LLM for **aspect-category sentiment classification over a fixed, closed aspect list** (not open-ended term extraction). That is the "simple" end of ABSA where zero-shot LLMs are competitive; the documented weakness is structured extraction (spans, quads).
- Use a plain, schema-constrained prompt with 3-6 few-shot examples covering Malay, Manglish and Mandarin; enforce enum outputs via JSON schema so out-of-set labels cannot occur; temperature 0.
- **Hand-label a gold set of about 200-300 texts** stratified by language, report per-language accuracy / macro-F1 and Cohen's kappa between two annotators and between annotator and LLM. Run Malaya sentiment/emotion on the Malay subset as a second opinion and report agreement. This is the single most valuable credibility addition for the JomRasa half.

---

## 6. Aspect categories in tourism / hospitality ABSA

### References

1. **Pontiki, M., et al. (2016).** "SemEval-2016 Task 5: Aspect Based Sentiment Analysis." *SemEval-2016*, https://aclanthology.org/S16-1002/ (task site https://alt.qcri.org/semeval2016/task5/ ; Arabic hotels data https://github.com/msmadi/ABSA-Hotels). 8 languages, 7 domains. Aspect category = Entity#Attribute. **Hotels domain** entities **[from memory - verify against the annotation guidelines]**: HOTEL, ROOMS, ROOM_AMENITIES, FACILITIES, SERVICE, LOCATION, FOOD&DRINKS; attributes: GENERAL, PRICES, DESIGN&FEATURES, CLEANLINESS, COMFORT, QUALITY, STYLE&OPTIONS, MISCELLANEOUS.
2. **Wang, H., Lu, Y., & Zhai, C. (2010).** "Latent aspect rating analysis on review text data: a rating regression approach." *KDD 2010*, 783-792. https://dl.acm.org/doi/10.1145/1835804.1835903 - the classic TripAdvisor dataset with the platform's seven rated aspects: **value, rooms, location, cleanliness, check-in/front desk, service, business service** (later TripAdvisor adds sleep quality).
3. **Marrese-Taylor, E., Velásquez, J. D., & Bravo-Marquez, F. (2014).** "A novel deterministic approach for aspect-based opinion mining in tourism products reviews." *Expert Systems with Applications*, 41(17), 7764-7775. https://www.sciencedirect.com/science/article/abs/pii/S0957417414003315 - adapts Liu's aspect-based opinion mining from physical products to tourism products (hotels, restaurants); about 90% precision/recall on orientation.
4. **Beerli, A., & Martín, J. D. (2004).** "Factors influencing destination image." *Annals of Tourism Research*, 31(3), 657-681. https://www.sciencedirect.com/science/article/abs/pii/S0160738304000349 - nine destination-image dimensions **[list from memory - verify]**: natural resources; general infrastructure; tourist infrastructure; tourist leisure and recreation; culture, history and art; political and economic factors; natural environment; social environment; atmosphere of the place.
5. Destination-level ABSA examples found: "Analyzing tourism reviews using an LDA topic-based sentiment analysis approach" (*MethodsX*, 2022, https://www.sciencedirect.com/science/article/pii/S2215016122002734); the Labuan Bajo IndoBERT study using **attractions, amenities, accessibility, price** from SERVQUAL / destination-quality theory (https://jurnal.polibatam.ac.id/index.php/JAIC/article/view/11565); and a 2025 *Expert Systems with Applications* study on Chinese A-level attractions (https://www.sciencedirect.com/science/article/abs/pii/S0957417425000181) whose search summary notes negative sentiment concentrates on **food, prices, crowding and sanitation**.

### Grounding your list

| Your topic | Grounding |
|---|---|
| Access / transport | Buhalis "Accessibility"; SemEval LOCATION; Beerli & Martín general infrastructure; Labuan Bajo "accessibility" |
| Accommodation | SemEval ROOMS/HOTEL; TripAdvisor rooms; Beerli & Martín tourist infrastructure |
| Food | SemEval FOOD&DRINKS; consistently a top topic in destination reviews |
| Price / value | SemEval #PRICES; TripAdvisor value; Labuan Bajo "price" |
| Crowding | Destination-review ABSA (negative-sentiment hotspot); ties to overtourism indicators in section 3 |
| Cleanliness | SemEval #CLEANLINESS; TripAdvisor cleanliness; "sanitation" |
| Scenery / nature | Beerli & Martín natural resources / natural environment; Buhalis Attractions |
| Culture / heritage | Beerli & Martín culture, history and art |
| Safety | Beerli & Martín political/social factors; WEF TTDI Safety & Security pillar |
| Activities | Buhalis Activities; Beerli & Martín leisure and recreation |
| **Hospitality / service (add it)** | SemEval SERVICE; TripAdvisor service; Beerli & Martín social environment (hospitality of residents). It is in every hotel ABSA scheme - leaving it out would be the one gap a reviewer would notice. |

Optional twelfth: **facilities / amenities** (toilets, signage, parking, Wi-Fi, prayer facilities) - SemEval FACILITIES, Buhalis Amenities. Useful because it maps 1:1 onto your Amenities pillar, giving a text-based cross-check of the statistical bottleneck. Likewise access/transport cross-checks the Access pillar.

---

## 7. Small-sample shrinkage for ratings

### References

1. **Efron, B., & Morris, C. (1975).** "Data Analysis Using Stein's Estimator and Its Generalizations." *JASA*, 70(350), 311-319. https://www.tandfonline.com/doi/abs/10.1080/01621459.1975.10479864 - the baseball / toxoplasmosis paper; James-Stein shrinkage toward the grand mean with unequal variances.
2. **Morris, C. N. (1983).** "Parametric Empirical Bayes Inference: Theory and Applications." *JASA*, 78(381), 47-55. https://www.tandfonline.com/doi/abs/10.1080/01621459.1983.10477920 - the general normal-normal EB model with unequal sample sizes, and interval estimates.
3. **Robinson, D. (2015).** "Understanding empirical Bayes estimation (using baseball statistics)." http://varianceexplained.org/r/empirical_bayes_baseball/ ; book *Introduction to Empirical Bayes* (2017). Practical beta-binomial recipe: fit a Beta prior to all units by MLE/moments, posterior mean = (successes + alpha) / (n + alpha + beta).
4. **Miller, E.** "How Not To Sort By Average Rating" (2009) and "Bayesian Average Ratings", https://www.evanmiller.org/bayesian-average-ratings.html - Wilson lower bound and the Bayesian alternative for ranking with few ratings. Wikipedia "Bayesian average" documents the IMDb-style formula: https://en.wikipedia.org/wiki/Bayesian_average

### Formula

IMDb-style Bayesian average (identical in form to the normal-normal EB posterior mean):

```
shrunk_i = (n_i * xbar_i + k * mu) / (n_i + k)  =  (1 - B_i) * xbar_i + B_i * mu,   B_i = k / (k + n_i)
```

- `xbar_i`, `n_i` = state i's raw mean score and number of texts; `mu` = grand mean (weight by n, or use the median of state means if one state dominates the corpus).
- `k` = prior strength = "number of pseudo-texts at the national mean".

### Choosing k (in order of defensibility)

1. **Empirical Bayes, method of moments** (Morris 1983): `k = sigma2_within / tau2_between`, where `sigma2_within` = pooled within-state variance of per-text scores and `tau2_between = max(0, Var(xbar_i) - mean(sigma2_within / n_i))`. This lets the data decide: if states genuinely differ, k is small; if differences are mostly noise, k is large. If tau2 comes out 0, fall back to option 2 and say so.
2. **Beta-binomial EB** if the score is a proportion (share of positive mentions): fit Beta(alpha, beta) across states; k = alpha + beta (Robinson).
3. **Heuristic**: k = median or lower-quartile n_i across states (IMDb uses a fixed minimum-votes threshold). Transparent but arbitrary - acceptable as a fallback, not as the headline.
4. James-Stein positive-part (equal-variance case): `B = min(1, (p - 3) * sigma2 / sum_i (xbar_i - mu)^2)` with p = 16 when shrinking toward the estimated grand mean. Only appropriate if n_i are roughly equal, which they will not be - prefer option 1.

Apply shrinkage **per aspect x state** as well (cells will be much thinner than state totals), and show `n` plus an uncertainty band (posterior sd approx sqrt(sigma2_within / (n_i + k))) on the dashboard. Grey out or flag any cell with n below about 5-10.

---

## 8. Repos and technical building blocks

| Need | Resource | Notes |
|---|---|---|
| Gini (numpy) | https://github.com/oliviaguest/gini | Single function, sorted-array formula; fast. No weights - for the population-weighted version write the trapezoid Lorenz integration yourself (about 10 lines). |
| Lorenz plot | https://zhiyzuo.github.io/Plot-Lorenz/ ; gist https://gist.github.com/CMCDragonkai/c79b9a0883e31b327c88bfadb8b06fc4 ; CORE Econ "Doing Economics" Python walkthrough https://books.core-econ.org/doing-economics/book/text/05-06.html | |
| Many concentration indices | https://github.com/open-risk/concentrationMetrics | Python library: Gini, HHI, Theil/entropy, Hoover-type, etc. Good for cross-checking your own numbers in tests. |
| Regional variants (R reference) | REAT `gini.conc` https://rdrr.io/cran/REAT/man/gini.conc.html ; EconGeo `Hoover.Gini` https://github.com/PABalland/EconGeo | Reference formulas for weighted / locational Gini. |
| **Malaysian state GeoJSON (official)** | https://github.com/dosm-malaysia/data-open/tree/main/datasets/geodata | Contains `administrative_1_state.geojson`, `administrative_2_district.geojson`, plus `state_district.csv`. **Use this one** - it is DOSM's own, which is the right provenance for a DOSM datathon, and state names will match OpenDOSM tables. |
| GeoJSON alternatives | geoBoundaries MYS ADM1 (simplified) via HDX https://data.humdata.org/dataset/geoboundaries-admin-boundaries-for-malaysia ; https://github.com/mptwaktusolat/jakim.geojson (districts) ; gist https://gist.github.com/heiswayi/81a169ab39dcf749c31a | Check how W.P. Putrajaya and Labuan are handled; simplify geometry (mapshaper) if the file is heavy - Plotly choropleth redraws are slow with large GeoJSON. |
| Streamlit + Plotly click | Docs https://docs.streamlit.io/develop/api-reference/charts/st.plotly_chart ; demo https://chart-selections-demo.streamlit.app/Plotly | `event = st.plotly_chart(fig, on_select="rerun", selection_mode="points", key=...)`; read `event.selection.points`. Only *selection* events are supported, not raw clicks (issue https://github.com/streamlit/streamlit/issues/8824). Some trace types return nothing (heatmap/imshow #8760, Sankey #8933); the docs do not list choropleth either way, and I found no confirmed report for it - **test `px.choropleth` with `on_select` first thing**; put the state name in `customdata`/`locations` so it appears in the returned point. |
| Streamlit + Folium click | https://github.com/randyzwitch/streamlit-folium | `st_folium(m, returned_objects=[...])` returns a dict; for a GeoJson/Choropleth layer the clicked feature comes back under `last_active_drawing` (and tooltip/popup text under `last_object_clicked_tooltip` / `_popup`) **[key names from memory - verify in the package README/examples]**. Limit `returned_objects` to avoid a rerun on every pan/zoom. More reliable for polygon clicks than Plotly selection, at the cost of a Leaflet look. |
| Legacy Plotly events | https://github.com/lhstorm/streamlit-plotly-events | Pre-`on_select` component; only needed on old Streamlit. |
| Power BI public report scraping | Selenium-based: https://github.com/holstt/powerbi-table-scraper , https://github.com/MuneebUH/powerbi-data-scraper ; crawler: https://github.com/NeoOniX/PowerBI-SE-Core | **I did not find a verified repo that documents the `querydata` endpoint directly.** The commonly used approach **[from memory - verify in browser DevTools]**: open the public report, Network tab, filter `querydata`; each visual POSTs a JSON body (`SemanticQueryDataShapeCommand`) to `https://wabi-<region>-api.analysis.windows.net/public/reports/querydata?synchronous=true` with header `X-PowerBI-ResourceKey: <key from the embed URL>`; replay with `requests`, then decode the compressed `dsr` result (value dictionaries `ValueDicts`, repeat-bitmask `R`, null-mask `Ø`). Row limits apply per query (raise `Top`/window count in the body). Before scraping, check whether the same numbers are on OpenDOSM / data.gov.my / data.tourism.gov.my; cache raw responses in `data/raw/` with the retrieval date; respect the site's terms. |

---

## Proposed changes to the plan

1. **Build the "Actual intensity" index from the standard pressure indicators** - domestic visitor arrivals (or nights) per 1,000 residents (Eurostat tourism intensity / Charvat), visitors per km2 (Eurostat tourism density), tourism receipts per capita, and hotel rooms per km2 - i.e. a McElroy & de Albuquerque-style Tourism Penetration Index. *Why: gives the Actual side a published pedigree and removes raw state size from the comparison.*
2. **Put Defert's tourist function (rooms or beds per 100 residents) in the Amenities pillar of Potential, not in Actual.** *Why: it measures supply capacity; mixing it into Actual would double-count with the capacity cap.*
3. **Compute Gap on a common, distribution-free scale**: either difference of percentile ranks / z-scores, or - better - the **residual from regressing Actual on Potential** across the 16 states. *Why: a difference of two min-max scores depends on each index's own min and max; a residual directly answers "fewer visitors than its potential predicts".*
4. **Aggregate indicators arithmetically within pillars, and report geometric aggregation across pillars** (scores rescaled to 1-100). *Why: limits compensability (UNDP HDI 2010; Greco et al. 2019) and is consistent with the bottleneck idea that the weakest pillar binds.*
5. **Equal weights, with Monte Carlo weight sensitivity** (Dirichlet draws x {min-max, z-score} x {arithmetic, geometric}); publish median rank, 5-95% rank interval and Spearman rho vs baseline, plus leave-one-indicator-out. No PCA weights. *Why: Saisana et al. (2005) standard; PCA is unstable at n = 16.*
6. **Winsorise or log-transform skewed indicators before min-max.** *Why: KL/Selangor outliers otherwise compress the other states into a narrow band (OECD/JRC Handbook).*
7. **Add normalised HHI and a population-weighted Gini / Hoover index alongside the plain Gini**, and show all three before/after in the simulator. *Why: plain Gini over 16 unequal-sized states conflates size with concentration; Hoover reads directly as "% of trips to redirect".*
8. **Fix the capacity cap's unit conversion**: visitors absorbable = spare room-nights x average guests per room / average length of stay, applied **only to the share of domestic visitors who stay in paid accommodation** (DTS separates tourists from same-day excursionists and reports accommodation type, including staying with friends/relatives). *Why: DTS "visitors" include day-trippers and VFR stays; capping all visitors by hotel room-nights would overstate the constraint by a large factor.*
9. **Make target occupancy a parameter (default 70%, range 60-80%, plus "best observed state AOR" option)** and compute spare capacity **monthly, not annually**, if monthly AOR is available. *Why: no literature-backed constant exists; annual averages hide school-holiday peaks when spare capacity is actually zero.*
10. **Express economic impact as a range**: output multiplier 1.2-1.8 (central ~1.4), value added ~0.56, import leakage ~0.22 per RM (Mazumder et al. 2009), weighted by the DTS spending mix; label inter-state redistribution as nationally near zero-sum. *Why: honest, sourced numbers; pre-empts the obvious judge question.*
11. **Score bottleneck pillars as robust z-scores vs the national median (divide by MAD)** instead of raw differences. *Why: makes Access / Awareness / Amenities shortfalls comparable across pillars with different spreads.*
12. **ABSA as closed-set aspect-category classification** with plain few-shot prompts, enum-constrained JSON, English labels; **add "hospitality/service"** (and optionally "facilities") to the aspect list. *Why: that is where zero-shot LLMs are competitive (Zhang et al. 2024; Wu et al. 2025: simple prompts beat elaborate ones); service is in every published tourism aspect scheme.*
13. **Use Ekman-6 + neutral (optionally + trust, anticipation), multi-label with 0-3 intensity.** *Why: matches GoEmotions' official reduction and BRIGHTER, nearly matches Malaya's label set for cross-checking, and avoids the fine-grained regime where zero-shot LLMs fail.*
14. **Create a 200-300 item hand-labelled gold set stratified by language** and report per-language macro-F1 / kappa, plus agreement with Malaya models on the Malay subset. *Why: converts "LLM-tagged" from an assertion into a measured instrument.*
15. **Set shrinkage strength by empirical Bayes (k = within-variance / between-state variance), applied per state and per aspect x state, and display n and an uncertainty band.** *Why: data-driven prior strength (Morris 1983; Efron & Morris 1975) instead of an arbitrary constant; falls back to median-n only if between-state variance estimates to zero.*
16. **Tie the simulator to the bottleneck diagnosis in the narrative**: present redistribution as an upper bound that is only reachable if the receiving state's binding pillar is addressed. *Why: dispersal evidence (Zuckerman Farkash et al. 2023; Koo et al. 2012) shows soft nudges alone move few visitors; access and amenities drive dispersal.*
