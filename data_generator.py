import requests
import json
import math
from config import API_KEY 

OUTPUT_FILENAME = "scene_data.json"

def calculate_impact_energy(diameter_m, velocity_kms, density_kg_m3=3000):
    radius_m = diameter_m / 2
    volume_m3 = (4/3) * math.pi * (radius_m**3)
    mass_kg = density_kg_m3 * volume_m3
    velocity_ms = velocity_kms * 1000
    kinetic_energy_joules = 0.5 * mass_kg * (velocity_ms**2)
    joules_per_kiloton_tnt = 4.184e12
    return kinetic_energy_joules / joules_per_kiloton_tnt

def calculate_orbit_points(orbital_elements, num_points=100):
    points = []
    e = float(orbital_elements['eccentricity'])
    a = float(orbital_elements['semi_major_axis'])
    for i in range(num_points + 1):
        angle = 2 * math.pi * i / num_points
        r = a * (1 - e**2) / (1 + e * math.cos(angle))
        x = r * math.cos(angle)
        y = r * math.sin(angle)
        z = 0 
        points.append([x, y, z])
    return points

def generate_data():
    print("Connecting to NASA API...")
    total_days = 90
    url = f"https://api.nasa.gov/neo/rest/v1/neo/browse?api_key={API_KEY}"
    try:
        response = requests.get(url)
        response.raise_for_status()
        raw_data = response.json()
        print(f"✅ Data fetched for {len(raw_data['near_earth_objects'])} NEOs.")
        
        output_data = {"asteroids": [], "earth_orbit": []}
        output_data["earth_orbit"] = calculate_orbit_points({'eccentricity': '0.0167', 'semi_major_axis': '1.0'})

        for neo in raw_data['near_earth_objects']:
            if not neo['close_approach_data']:
                continue
            
            velocity_kms = float(neo['close_approach_data'][0]['relative_velocity']['kilometers_per_second'])
            diameter_m = (neo['estimated_diameter']['meters']['estimated_diameter_min'] + 
                          neo['estimated_diameter']['meters']['estimated_diameter_max']) / 2

            asteroid_info = {
                "name": neo['name'],
                "id": neo['id'],
                "diameter_m": round(diameter_m, 2),
                "velocity_kms": round(velocity_kms, 2),
                "impact_energy_kt": round(calculate_impact_energy(diameter_m, velocity_kms), 2),
                "trajectory_points": calculate_orbit_points(neo['orbital_data'])
            }
            output_data["asteroids"].append(asteroid_info)

        with open(OUTPUT_FILENAME, 'w') as f:
            json.dump(output_data, f, indent=2)
        print(f"Success! All data has been processed and saved to '{OUTPUT_FILENAME}'")

    except Exception as e:
        print(f" An error occurred: {e}")

if __name__ == "__main__":
    generate_data()