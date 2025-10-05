import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg') });
const controls = new OrbitControls(camera, renderer.domElement);
const textureLoader = new THREE.TextureLoader();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const clock = new THREE.Clock();
let sceneData = null;
let selectedAsteroidData = null;
let activeAnimation = null;
let isRotationPaused = false;
let earth = null;
let lastMarker = null;

function init() {
    camera.position.set(0, 0, 10);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    controls.enablePan = false;
    controls.minDistance = 4.5;
    controls.maxDistance = 20;
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);
    const earthGeometry = new THREE.SphereGeometry(4, 64, 64);
    const earthMaterial = new THREE.MeshStandardMaterial({
        map: textureLoader.load('textures/earth_texture.jpg'),
    });
    earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);
    fetchDataAndSetupUI();
    addEventListeners();
    setupCustomMode();
    animate();
}

function fetchDataAndSetupUI() {
    fetch('scene_data.json')
        .then(res => res.json())
        .then(data => {
            sceneData = data;
            populateAsteroidSelector();
            updateInfoPanel();
        });
}

function populateAsteroidSelector() {
    const asteroidSelect = document.getElementById('asteroid-select');
    asteroidSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select asteroid';
    defaultOption.selected = true;
    defaultOption.disabled = true;
    asteroidSelect.appendChild(defaultOption);
    sceneData.asteroids.forEach(asteroid => {
        const option = document.createElement('option');
        option.value = asteroid.id;
        option.textContent = asteroid.name;
        asteroidSelect.appendChild(option);
    });
}

function getDeflectionStrategy(asteroid) {
    const diameter = asteroid.diameter_m;
    const energy = asteroid.impact_energy_kt;

    if (diameter > 1000 || energy > 5000000) {
        return {
            name: "Nuclear Interceptor (Last Resort)",
            description: "A standoff nuclear detonation vaporizes the asteroid's surface, creating a powerful push. Reserved for massive, short-notice threats where other options are not feasible."
        };
    } else if (diameter > 150) {
        return {
            name: "Kinetic Impactor (DART Mission)",
            description: "A high-speed spacecraft collides with the asteroid to alter its trajectory. A proven method for medium to large bodies with sufficient warning time."
        };
    } else {
        return {
            name: "Gravity Tractor",
            description: "A heavy spacecraft flies alongside the asteroid. Its subtle gravitational pull slowly tugs the asteroid onto a safer orbit over months or years. Ideal for smaller threats."
        };
    }
}

function updateInfoPanel() {
    if (!selectedAsteroidData) return;

    document.getElementById('info-diameter').textContent = `${selectedAsteroidData.diameter_m} m`;
    document.getElementById('info-velocity').textContent = `${selectedAsteroidData.velocity_kms} km/s`;
    const energy = selectedAsteroidData.impact_energy_kt;
    const hiroshimaBombs = Math.round(energy / 15);
    document.getElementById('info-energy').textContent = `${energy.toLocaleString()} kT TNT (~${hiroshimaBombs.toLocaleString()} bombs)`;

    const strategy = getDeflectionStrategy(selectedAsteroidData);
    const deflectionPanel = document.getElementById('deflection-panel');
    deflectionPanel.innerHTML = `
        <div style="margin-top: 15px; padding: 10px; background-color: rgba(0, 50, 100, 0.5); border-radius: 5px;">
            <h3 style="margin: 0 0 5px 0; color: #a0d8ff;">Recommended Strategy:</h3>
            <strong>${strategy.name}</strong>
            <p style="font-size: 0.9em; margin: 5px 0 0 0;">${strategy.description}</p>
        </div>
    `;
    deflectionPanel.style.display = 'block';
}

function calculate_impact_energy(diameter_m, velocity_kms, density_kg_m3 = 3000) {
    const radius_m = diameter_m / 2;
    const volume_m3 = (4/3) * Math.PI * (radius_m**3);
    const mass_kg = density_kg_m3 * volume_m3;
    const velocity_ms = velocity_kms * 1000;
    const kinetic_energy_joules = 0.5 * mass_kg * (velocity_ms**2);
    const joules_per_kiloton_tnt = 4.184e12;
    return parseFloat(kinetic_energy_joules / joules_per_kiloton_tnt);
}

function setupCustomMode() {
    const modeRealRadio = document.getElementById('modeReal');
    const modeCustomRadio = document.getElementById('modeCustom');
    const realControls = document.getElementById('real-asteroid-controls');
    const customControls = document.getElementById('custom-asteroid-controls');
    const diameterSlider = document.getElementById('diameter-slider');
    const velocitySlider = document.getElementById('velocity-slider');
    const diameterValue = document.getElementById('diameter-value');
    const velocityValue = document.getElementById('velocity-value');

    function updateCustomAsteroidData() {
        const diameter = parseFloat(diameterSlider.value);
        const velocity = parseFloat(velocitySlider.value);
        const energy = calculate_impact_energy(diameter, velocity);
        
        selectedAsteroidData = {
            name: "Custom Asteroid",
            id: "custom",
            diameter_m: diameter,
            velocity_kms: velocity,
            impact_energy_kt: energy
        };

        diameterValue.textContent = diameter;
        velocityValue.textContent = velocity;
        updateInfoPanel();
    }

    modeRealRadio.addEventListener('change', () => {
        realControls.style.display = 'block';
        customControls.style.display = 'none';
        const asteroidSelect = document.getElementById('asteroid-select');
        selectedAsteroidData = sceneData.asteroids.find(a => a.id === asteroidSelect.value);
        updateInfoPanel();
    });

    modeCustomRadio.addEventListener('change', () => {
        realControls.style.display = 'none';
        customControls.style.display = 'block';
        updateCustomAsteroidData();
    });
    
    diameterSlider.addEventListener('input', updateCustomAsteroidData);
    velocitySlider.addEventListener('input', updateCustomAsteroidData);
}
function triggerImpact(impactPoint) {
    if (!selectedAsteroidData) return;
    const asteroidSize = Math.max(0.1, Math.log10(selectedAsteroidData.diameter_m) / 10);
    const asteroidGeometry = new THREE.SphereGeometry(asteroidSize, 20, 20);
    const asteroidMaterial = new THREE.MeshStandardMaterial({ map: textureLoader.load('textures/asteroid_texture.jpg') });
    const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
    const startPosition = camera.position.clone().add(new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, -15));
    asteroid.position.copy(startPosition);
    scene.add(asteroid);
    const impactEffect = new THREE.Mesh(
        new THREE.RingGeometry(0.01, 0.02, 32),
        new THREE.MeshBasicMaterial({ color: 0xffed85, side: THREE.DoubleSide, transparent: true })
    );
    impactEffect.position.copy(impactPoint);
    impactEffect.lookAt(earth.position);
    impactEffect.visible = false;
    scene.add(impactEffect);
    activeAnimation = { asteroid, impactEffect, startPosition, endPosition: impactPoint, progress: 0, duration: 2 };
}

function onMouseClick(event) {
    if (event.target.closest('#ui-container')) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(earth);
    if (intersects.length > 0) {
        isRotationPaused = true;
        const impactPoint = intersects[0].point;
        if (lastMarker) scene.remove(lastMarker);
        const markerGeometry = new THREE.SphereGeometry(0.05, 16, 16);
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(impactPoint);
        scene.add(marker);
        lastMarker = marker;
        triggerImpact(impactPoint);
    }
}

function addEventListeners() {
    window.addEventListener('click', onMouseClick);
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.getElementById('asteroid-select').addEventListener('change', () => {
        const asteroidSelect = document.getElementById('asteroid-select');
        selectedAsteroidData = sceneData.asteroids.find(a => a.id === asteroidSelect.value);
        updateInfoPanel();
    });

    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    zoomInBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newDistance = Math.max(controls.minDistance, camera.position.length() - 1);
        camera.position.setLength(newDistance);
    });
    zoomOutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newDistance = Math.min(controls.maxDistance, camera.position.length() + 1);
        camera.position.setLength(newDistance);
    });
}

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    if (!isRotationPaused) {
        earth.rotation.y += 0.0005;
    }
    if (activeAnimation) {
        activeAnimation.progress += deltaTime / activeAnimation.duration;
        if (activeAnimation.progress < 1) {
            activeAnimation.asteroid.position.lerpVectors(activeAnimation.startPosition, activeAnimation.endPosition, activeAnimation.progress);
        } else {
            if (activeAnimation.asteroid) {
                 scene.remove(activeAnimation.asteroid);
                 activeAnimation.asteroid = null;
                 showImpactReport();
            }
            activeAnimation.impactEffect.visible = true;
            const scaleProgress = (activeAnimation.progress - 1) * 2;
            const newScale = 1 + scaleProgress * 10;
            activeAnimation.impactEffect.scale.set(newScale, newScale, newScale);
            activeAnimation.impactEffect.material.opacity = 1 - scaleProgress;
            if (activeAnimation.impactEffect.material.opacity <= 0) {
                scene.remove(activeAnimation.impactEffect);
                activeAnimation = null;
            }
        }
    }
    controls.update();
    renderer.render(scene, camera);
}

function getImpactConsequences(asteroid) {
    const energy_kt = asteroid.impact_energy_kt;
    const energy_joules = energy_kt * 4.184e12;
    const magnitude = (2/3) * (Math.log10(energy_joules) - 4.4);
    const crater_diameter_km = 0.07 * Math.pow(energy_kt, 1/3.4);
    const air_blast_radius_km = 0.8 * Math.pow(energy_kt, 1/3);

    let intensity = "IV (Light)";
    if (magnitude > 6) intensity = "VII (Very Strong)";
    if (magnitude > 8) intensity = "X+ (Extreme)";

    return {
        magnitude: magnitude.toFixed(1),
        shaking_intensity: intensity,
        crater_diameter_km: crater_diameter_km.toFixed(2),
        air_blast_radius_km: air_blast_radius_km.toFixed(2),
        tsunami_warning: "High potential for mega-tsunami if impact occurs at sea."
    };
}

function showImpactReport() {
    if (!selectedAsteroidData) return;
    const infoPanel = document.getElementById('info-panel');
    const impactData = getImpactConsequences(selectedAsteroidData);
    infoPanel.innerHTML = `
        <h2 style="color: #ff6b6b;">Impact Report</h2>
        <p><strong>Seismic Magnitude:</strong> ${impactData.magnitude} (Richter Scale)</p>
        <p><strong>Shaking Intensity:</strong> ${impactData.shaking_intensity}</p>
        <p><strong>Est. Crater Diameter:</strong> ${impactData.crater_diameter_km} km</p>
        <p><strong>Air Blast Radius:</strong> ${impactData.air_blast_radius_km} km (for 3psi overpressure)</p>
        <p><strong>Tsunami Potential:</strong> ${impactData.tsunami_warning}</p>
        <button onclick="window.location.reload()" style="width:100%; padding:10px; margin-top:15px;">Reset Simulation</button>
    `;
}

// --- Start the App ---
init();