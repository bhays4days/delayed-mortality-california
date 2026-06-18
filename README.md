# delayed-mortality-california
"Impacts of fire and drought on delayed tree mortality patterns in California "

## External GEE Assets Used

| Asset | GEE Path | Citation |
|---|---|---|
| CA state perimeter | `TIGER/2016/States` | US Census Bureau 2007 |
| LandFire 2001 | `https://landfire.gov/vegetation/evc` |  |LANDFIRE. (2001). Existing Vegetation Type (EVT), Existing Vegetation Cover (EVC), and Existing Vegetation Height (EVH), LF 2001 (version 1.0.5). U.S. Department of the Interior, U.S. Geological Survey. https://doi.org/10.5066/P13KXTGM
| TerraClimate | `IDAHO_EPSCOR/TERRACLIMATE` | Abatzoglou et al. 2018 |
| MTBS fire perimeters | `USFS/GTAC/MTBS/burned_area_boundaries/v1` | Eidenshink et al. 2007 |
| MTBS fire severity | `USFS/GTAC/MTBS/annual_burn_severity_mosaics/v1` | USDA Forest Service |
| RAP v3 | `projects/rap-data-365417/assets/vegetation-cover-v3` | Allred et al. 2021 |
| Landsat Collection 2 | `LANDSAT/LC08/C02/T1_L2` | USGS |
| Hansen Global Forest | `UMD/hansen/global_forest_change_2023_v1_11` | Hansen et al. 2013 |
| JRC Surface Water | `JRC/GSW1_4/GlobalSurfaceWater` | Pekel et al. 2016 |
| SRTM Elevation | `USGS/SRTMGL1_003` | Farr et al. 2007 |

## GEE Assets
  
### Ch1 Plot Centroids
- **GEE Asset path:** `projects/ee-brittnhays/assets/Plots_Useable_Final_Clean`
- **Description:** 22,041 1-ha circular virtual plot centroids (56m radius)
  generated within and surrounding 175 CA MTBS fire perimeters (2000-2014)
- **Properties:** plot_key, Fire_ID, Ig_Year, Correct_Plot_Label_final,
  lat, long, focal_year, Category
- **Generation:** Plots generated in Google Earth Engine from MTBS fire
  polygons ≥400 ha with ≥50% pre-fire forest cover (Hansen et al. 2013).
  See Ch1_PlotGeneration.js for full methods.

### Ch1 Plots used for stratification
- **GEE Asset path:** `projects/britthays-uwyo/assets/Stratified_Wildfire_Plots_195`
- **Description:** 33,087 1-ha circular virtual plot centroids (56m radius)
  generated within and surrounding 175 CA MTBS fire perimeters (2000-2014)
- **Properties:** plot_key, Fire_ID, Ig_Year, Correct_Plot_Label_final,
  lat, long, focal_year, Category
- **Generation:** Plots generated in Google Earth Engine from MTBS fire
  polygons ≥400 ha with ≥50% pre-fire forest cover (Hansen et al. 2013).
  See Ch1_PlotGeneration.js for full methods.

### Ch1 Landfire 2001 Data
- **GEE Asset path:** `projects/britthays-uwyo/assets/EVC2001`
- **GEE Asset path:** `projects/britthays-uwyo/assets/EVH2001`
- **GEE Asset path:** `projects/britthays-uwyo/assets/BPS2001`
- **Description:** LandFire Existing Vegetation Cover, Existing Vegetation Height, Type, amd Biophysical Properties from the year 2001
- **Properties:** value, ev*_name, bps_name, EVT_GP, EVT_GP_N,SAF_SRM, EVT_ORDER, EVT_CLASS, EVT_SBCLS, R, G, B, RED, GREEN, BLUE
- **Generation:** Downloaded from https://landfire.gov/vegetation/evc (attribute data table)
