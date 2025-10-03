// Displays messages in the message box
        function showMessage(msg, type = 'info') {
            const messageBox = document.getElementById('messageBox'); // Ensure messageBox is accessible
            messageBox.textContent = msg;
            messageBox.style.display = 'block';
            messageBox.className = `message-box ${type === 'error' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-yellow-100 border-yellow-400 text-yellow-700'}`;
        }

        // Hides the message box
        function hideMessage() {
            const messageBox = document.getElementById('messageBox'); // Ensure messageBox is accessible
            messageBox.style.display = 'none';
        }

        // Callback function for when OpenCV.js is ready
        function onOpenCvReady() {
            cvReady = true;
            showMessage('OpenCV.js carregado com sucesso!', 'success');
            console.log('OpenCV.js is ready.');
        }

// Declare all constants at the top of the script
        const imageUpload = document.getElementById('imageUpload');
        const processImageBtn = document.getElementById('processImageBtn');
        const mountainCanvas = document.getElementById('mountainCanvas');
        const ctx = mountainCanvas.getContext('2d');
        const showContourCheckbox = document.getElementById('showContourCheckbox');
        const showCostLabelsCheckbox = document.getElementById('showCostLabelsCheckbox');
        const trailDataInput = document.getElementById('trailDataInput');
        const loadTrailDataBtn = document.getElementById('loadTrailDataBtn');
        const trailDataValidationMessage = document.getElementById('trailDataValidationMessage');
        const NODE_RADIUS = 20; // Fixed NODE_RADIUS for consistent visual size
		let nodes = new Map(); // Global map to store node data
		let edges = []; // Global array to store edge data
		let nodeColors = new Map(); // Global map to store node colors

        let img = new Image();
        let cvReady = false;
        let clickableAreas = []; // Stores areas for click detection on canvas
        let currentPolygon = null; // Stores the detected polygon from the image
        let zoomPopupOpen = false; // Flag to track if the zoom popup is open
        let currentHoveredCluster = null; // Stores the cluster of nodes currently hovered over
        let zoomCloseTimeout = null; // Timeout for closing the zoom popup

        let activeStagePopup = null; // Stores information about the currently open stage popup

        // Default trail data structure
        let trailData = {
            "processo": "Criação de Relatório Técnico",
            "etapas": [
                { "id": 1, "etapa": "Coleta de dados", "dificuldade": "média", "responsavel": "eu", "custo":"1-2=1" },
                { "id": 2, "etapa": "Redação do conteúdo", "dificuldade": "média", "responsavel": "eu", "responsavel": "eu", "custo":"2-3=2;2-4=6" },
                { "id": 3, "etapa": "Análise estatística", "dificuldade": "alta", "responsavel": "outro", "custo":"3-4=3" },
                { "id": 4, "etapa": "Revisão técnica", "dificuldade": "alta", "responsavel": "outro", "custo":"4-5=1" },
                { "id": 5, "etapa": "Formatação e diagramação", "dificuldade": "baixa", "responsavel": "eu", "custo":"5-6=10" },
                { "id": 6, "etapa": "Entrega final", "dificuldade": "baixa", "responsavel": "outro", "custo":"" }
            ]
        };

        // Predefined colors for nodes
        const NODE_COLORS = [
            '#FFD700', // Gold
            '#4CAF50', // Green
            '#2196F3', // Blue
            '#FF5722', // Deep Orange
            '#9C27B0', // Purple
            '#FFEB3B', // Yellow
            '#795548', // Brown
            '#E91E63', // Pink
            '#00BCD4', // Cyan
            '#607D8B', // Blue Grey
            '#8BC34A', // Light Green
            '#FFC107'  // Amber
        ];

        // Function to close the zoom popup (no animation)
        function closeZoomPopup() {
            const zoomModalElement = document.getElementById('zoomModal');
            if (zoomModalElement) {
                zoomModalElement.remove();
                zoomPopupOpen = false;
                currentHoveredCluster = null;
                // Redraw main canvas to clear funnel lines
                if (currentPolygon) {
                    desenharPoligonoETrilha(currentPolygon, showContourCheckbox.checked, showCostLabelsCheckbox.checked);
                } else {
                    ctx.clearRect(0, 0, mountainCanvas.width, mountainCanvas.height);
                    ctx.drawImage(img, 0, 0, mountainCanvas.width, mountainCanvas.height);
                }
            }
        }
		
		// Opens a zoomed-in popup for a cluster of colliding nodes
		function openZoomPopup(cluster, mouseX, mouseY) {
            // 1. Clear any existing zoom modal and active stage popup
            closeZoomPopup();
            closeStagePopup();

            // 2. Redraw the main canvas to clear any previous funnel lines or popups
            if (currentPolygon) {
                desenharPoligonoETrilha(currentPolygon, showContourCheckbox.checked, showCostLabelsCheckbox.checked);
            } else {
                ctx.clearRect(0, 0, mountainCanvas.width, mountainCanvas.height);
                ctx.drawImage(img, 0, 0, mountainCanvas.width, mountainCanvas.height);
            }

            // Determine bounding box do cluster
            const margin = 40;
            const minX = Math.min(...cluster.map(n => n.x)) - margin;
            const minY = Math.min(...cluster.map(n => n.y)) - margin;
            const maxX = Math.max(...cluster.map(n => n.x)) + margin;
            const maxY = Math.max(...cluster.map(n => n.y)) + margin;

            const width = maxX - minX;
            const height = maxY - minY;

            const zoomPopupSize = 400; // Fixed size for the zoom popup

            // Calculate center of the original cluster on the main canvas
            let clusterMinX = Infinity, clusterMaxX = -Infinity;
            let clusterMinY = Infinity, clusterMaxY = -Infinity;
            cluster.forEach(node => {
                clusterMinX = Math.min(clusterMinX, node.x);
                clusterMaxX = Math.max(clusterMaxX, node.x);
                clusterMinY = Math.min(clusterMinY, node.y);
                clusterMaxY = Math.max(clusterMaxY, node.y);
            });
            const originalClusterCenterX = (clusterMinX + clusterMaxX) / 2;
            const originalClusterCenterY = (clusterMinY + clusterMaxY) / 2;
            
            // Calculate dynamic originalClusterRadius based on the spread of the cluster
            let originalClusterRadius = 0;
            cluster.forEach(node => {
                const dist = Math.sqrt(Math.pow(node.x - originalClusterCenterX, 2) + Math.pow(node.y - originalClusterCenterY, 2));
                originalClusterRadius = Math.max(originalClusterRadius, dist + NODE_RADIUS); // Add NODE_RADIUS to encompass the node circle itself
            });
            // Ensure a minimum radius if only one node or very close nodes
            originalClusterRadius = Math.max(originalClusterRadius, NODE_RADIUS * 1.5);


            let zoomPopupCanvasX = originalClusterCenterX;
            let zoomPopupCanvasY = originalClusterCenterY;
            const paddingBetweenClusterAndPopup = 30; // Extra space
            // Adjusted requiredOffset to use the dynamic originalClusterRadius
            const requiredOffset = originalClusterRadius + zoomPopupSize / 2 + paddingBetweenClusterAndPopup;

            const canvasWidth = mountainCanvas.width;
            const canvasHeight = mountainCanvas.height;

            // Define potential positions (x, y are top-left of the popup)
            // Order them by preference if needed, e.g., top-right, then top-left, etc.
            const potentialPositions = [
                { x: originalClusterCenterX + requiredOffset, y: originalClusterCenterY - requiredOffset - zoomPopupSize/2 }, // Top-Right
                { x: originalClusterCenterX - requiredOffset - zoomPopupSize, y: originalClusterCenterY - requiredOffset - zoomPopupSize/2 }, // Top-Left
                { x: originalClusterCenterX + requiredOffset, y: originalClusterCenterY + requiredOffset - zoomPopupSize/2 }, // Bottom-Right
                { x: originalClusterCenterX - requiredOffset - zoomPopupSize, y: originalClusterCenterY + requiredOffset - zoomPopupSize/2 }  // Bottom-Left
            ];

            let foundPosition = false;
            for (const pos of potentialPositions) {
                // Check if the potential position is entirely within canvas bounds
                if (pos.x >= 0 && pos.x + zoomPopupSize <= canvasWidth &&
                    pos.y >= 0 && pos.y + zoomPopupSize <= canvasHeight) {

                    // Check for overlap with the original cluster area
                    const clusterRect = {
                        left: originalClusterCenterX - originalClusterRadius,
                        right: originalClusterCenterX + originalClusterRadius,
                        top: originalClusterCenterY - originalClusterRadius,
                        bottom: originalClusterCenterY + originalClusterRadius
                    };
                    const popupRect = {
                        left: pos.x,
                        right: pos.x + zoomPopupSize,
                        top: pos.y,
                        bottom: pos.y + zoomPopupSize
                    };

                    // No overlap if:
                    // popup is to the right of cluster OR popup is to the left of cluster
                    // AND popup is below cluster OR popup is above cluster
                    const noOverlap = (popupRect.left >= clusterRect.right || popupRect.right <= clusterRect.left ||
                                       popupRect.top >= clusterRect.bottom || popupRect.bottom <= clusterRect.top);

                    if (noOverlap) {
                        zoomPopupCanvasX = pos.x;
                        zoomPopupCanvasY = pos.y;
                        foundPosition = true;
                        break;
                    }
                }
            }

            // Fallback: if no ideal position found, center it (might overlap, but at least it's visible)
            if (!foundPosition) {
                zoomPopupCanvasX = (canvasWidth - zoomPopupSize) / 2;
                zoomPopupCanvasY = (canvasHeight - zoomPopupSize) / 2;
            }


			// Criar modal
			const zoomModal = document.createElement('div');
			zoomModal.id = 'zoomModal'; // Add ID for easy removal
			zoomModal.className = "absolute z-50"; // Changed to absolute, removed bg-black etc.
            
            // Position the modal using calculated canvas coordinates, relative to the canvas parent
            const containerRect = mountainCanvas.parentElement.getBoundingClientRect();
            const canvasRect = mountainCanvas.getBoundingClientRect();

            // Calculate the position of the zoom popup relative to the container
            // zoomPopupCanvasX and zoomPopupCanvasY are in the internal canvas coordinates.
            // We need to scale them to the rendered CSS size of the canvas,
            // and then offset them by the canvas's position relative to its parent (the container).
            
            // Position of the canvas top-left relative to the container top-left
            const canvasOffsetLeft = canvasRect.left - containerRect.left;
            const canvasOffsetTop = canvasRect.top - containerRect.top;

            // Scale factor from internal canvas resolution to displayed CSS pixels
            const scaleX_display = canvasRect.width / mountainCanvas.width;
            const scaleY_display = canvasRect.height / mountainCanvas.height;

            // Calculate the final CSS position for the zoom modal
            zoomModal.style.left = `${canvasOffsetLeft + (zoomPopupCanvasX * scaleX_display)}px`;
            zoomModal.style.top = `${canvasOffsetTop + (zoomPopupCanvasY * scaleY_display)}px`;
            zoomModal.style.width = `${zoomPopupSize * scaleX_display}px`;
            zoomModal.style.height = `${zoomPopupSize * scaleY_display}px`;
            
            // Append to the container instead of body
            mountainCanvas.parentElement.appendChild(zoomModal);

			zoomModal.innerHTML = `
    <div id="zoomContent" class="rounded-full shadow-lg relative" style="width: 100%; height: 100%;">
        <button id="closeZoom" class="absolute text-gray-400 hover:text-red-600 text-xl font-bold" 
                style="top: 4px; right: 6px;">&times;</button>
        <canvas id="zoomCanvas" width="400" height="400"></canvas>
    </div>
`;

const zoomCanvas = document.getElementById('zoomCanvas');
const zctx = zoomCanvas.getContext('2d');

// Definindo o raio com borda já incluída
const radius = zoomPopupSize / 2;
const borderWidth = 4; // espessura da borda branca

// Desenho único: imagem recortada e borda juntos
zctx.save();
zctx.beginPath();
zctx.arc(radius, radius, radius - borderWidth / 2, 0, Math.PI * 2, true);
zctx.closePath();
zctx.clip();

// Desenha imagem dentro do círculo
zctx.drawImage(
    img,  
    minX, minY,  
    width, height,  
    0, 0,  
    zoomPopupSize, zoomPopupSize  
);
zctx.restore();

// Desenha borda branca única no mesmo círculo
zctx.beginPath();
zctx.arc(radius, radius, radius - borderWidth / 2, 0, Math.PI * 2);
zctx.strokeStyle = 'white';
zctx.lineWidth = borderWidth;
zctx.stroke();


			// Escala para ajustar coordenadas dos elementos
			const scaleX = zoomPopupSize / width;
			const scaleY = zoomPopupSize / height;

			// Desenhar arestas no zoom (incluindo conexões externas)
            edges.forEach(edge => {
                const startNode = nodes.get(edge.sourceId);
                const endNode = nodes.get(edge.destId);

                // Check if at least one node of the edge is in the cluster
                const isStartNodeInCluster = cluster.includes(startNode);
                const isEndNodeInCluster = cluster.includes(endNode);

                if (isStartNodeInCluster || isEndNodeInCluster) {
                    zctx.beginPath();
                    zctx.strokeStyle = nodeColors.get(startNode.stageData.id);
                    zctx.lineWidth = 2;

                    // Case 1: Both nodes are in the cluster
                    if (isStartNodeInCluster && isEndNodeInCluster) {
                        const startZoomX = (startNode.x - minX) * scaleX;
                        const startZoomY = (startNode.y - minY) * scaleY;
                        const endZoomX = (endNode.x - minX) * scaleX;
                        const endZoomY = (endNode.y - minY) * scaleY;
                        zctx.moveTo(startZoomX, startZoomY);
                        zctx.lineTo(endZoomX, endZoomY);
                    } 
                    // Case 2: Start node in cluster, End node outside
                    else if (isStartNodeInCluster && !isEndNodeInCluster) {
                        const startZoomX = (startNode.x - minX) * scaleX;
                        const startZoomY = (startNode.y - minY) * scaleY;
                        
                        // Calculate vector from startNode to originalClusterCenter to determine funnel direction
                        const dx_to_center = originalClusterCenterX - startNode.x;
                        const dy_to_center = originalClusterCenterY - startNode.y;
                        const dist_to_center = Math.sqrt(dx_to_center * dx_to_center + dy_to_center * dy_to_center);

                        // Calculate the target point on the zoom canvas circle's edge
                        const angleToEdge = Math.atan2(
                            (endNode.y - minY) * scaleY - startZoomY,
                            (endNode.x - minX) * scaleX - startZoomX
                        );

                        const funnelTargetX = radius + (radius - borderWidth / 2) * Math.cos(angleToEdge);
                        const funnelTargetY = radius + (radius - borderWidth / 2) * Math.sin(angleToEdge);

                        zctx.moveTo(startZoomX, startZoomY);
                        zctx.lineTo(funnelTargetX, funnelTargetY);
                    }
                    // Case 3: End node in cluster, Start node outside
                    else if (!isStartNodeInCluster && isEndNodeInCluster) {
                        const endZoomX = (endNode.x - minX) * scaleX;
                        const endZoomY = (endNode.y - minY) * scaleY;

                        // Calculate the target point on the zoom canvas circle's edge
                        const angleToEdge = Math.atan2(
                            (startNode.y - minY) * scaleY - endZoomY,
                            (startNode.x - minX) * scaleX - endZoomX
                        );

                        const funnelTargetX = radius + (radius - borderWidth / 2) * Math.cos(angleToEdge);
                        const funnelTargetY = radius + (radius - borderWidth / 2) * Math.sin(angleToEdge);

                        zctx.moveTo(funnelTargetX, funnelTargetY);
                        zctx.lineTo(endZoomX, endZoomY);
                    }
                    zctx.stroke();
                }
            });


			// Desenhar vértices no zoom
			cluster.forEach(node => {
				const zoomX = (node.x - minX) * scaleX;
				const zoomY = (node.y - minY) * scaleY;
				zctx.beginPath();
				zctx.arc(zoomX, zoomY, NODE_RADIUS * 1.5, 0, 2 * Math.PI);
				zctx.fillStyle = nodeColors.get(node.stageData.id);
				zctx.fill();
				zctx.fillStyle = '#333';
				zctx.font = '12px Inter';
				zctx.textAlign = 'center';
				zctx.fillText(node.stageData.etapa, zoomX, zoomY - NODE_RADIUS * 2);
			});

            // Close zoom popup button
			document.getElementById('closeZoom').onclick = closeZoomPopup;

			// Add click listener for nodes inside the zoom canvas
            zoomCanvas.addEventListener('click', (ze) => {
                const zoomRect = zoomCanvas.getBoundingClientRect();
                const zoomClickX = (ze.clientX - zoomRect.left);
                const zoomClickY = (ze.clientY - zoomRect.top);

                for (const node of cluster) {
                    const zoomNodeX = (node.x - minX) * scaleX;
                    const zoomNodeY = (node.y - minY) * scaleY;
                    const distance = Math.sqrt(Math.pow(zoomClickX - zoomNodeX, 2) + Math.pow(zoomClickY - zoomNodeY, 2));
                    if (distance <= NODE_RADIUS * 1.5) { // Check against magnified radius
                        openModalForStage(node.stageData, node.x, node.y); // Pass canvas coordinates
                        closeZoomPopup(); // Close zoom modal after opening stage modal
                        break;
                    }
                }
            });

            // Add mousemove event listener to the zoom canvas for cursor change
            zoomCanvas.addEventListener('mousemove', (ze) => {
                const zoomRect = zoomCanvas.getBoundingClientRect();
                const zoomMouseX = (ze.clientX - zoomRect.left);
                const zoomMouseY = (ze.clientY - zoomRect.top);

                let hoveredNodeInZoom = false;
                for (const node of cluster) {
                    const zoomNodeX = (node.x - minX) * scaleX;
                    const zoomNodeY = (node.y - minY) * scaleY;
                    // Corrected: Use zoomMouseX and zoomMouseY instead of zoomClickX and zoomClickY
                    const distance = Math.sqrt(Math.pow(zoomMouseX - zoomNodeX, 2) + Math.pow(zoomMouseY - zoomNodeY, 2));
                    if (distance <= NODE_RADIUS * 1.5) { // Check against magnified radius
                        hoveredNodeInZoom = true;
                        break;
                    }
                }

                if (hoveredNodeInZoom) {
                    zoomCanvas.style.cursor = 'pointer'; // Cursor for individual nodes in zoom
                } else {
                    zoomCanvas.style.cursor = 'default';
                }
            });

            // --- Funnel Effect Drawing on Main Canvas ---
            // Recalculate center of the original cluster on the main canvas
            // (Already done above, but for clarity in this section)
            // originalClusterCenterX, originalClusterCenterY, originalClusterRadius

            // Get the zoom modal's actual screen position after it's added to the DOM
            // Need to wait for the modal to be rendered for accurate rect
 // --- Funnel Effect Drawing on Main Canvas ---
setTimeout(() => {
    const zoomModalElement = document.getElementById('zoomModal');
    if (!zoomModalElement) return;

    const zoomModalRect = zoomModalElement.getBoundingClientRect();
    const zoomPopupScreenX_relativeToCanvas = zoomModalRect.left - canvasRect.left;
    const zoomPopupScreenY_relativeToCanvas = zoomModalRect.top - canvasRect.top;

    const zoomPopupCanvasCenterX_forFunnel = (zoomPopupScreenX_relativeToCanvas + zoomModalRect.width / 2) / scaleX_display;
    const zoomPopupCanvasCenterY_forFunnel = (zoomPopupScreenY_relativeToCanvas + zoomModalRect.height / 2) / scaleY_display;

    const R1 = originalClusterRadius;
    const R2 = zoomPopupSize / 2; // único raio real agora
    const d = Math.sqrt(
        Math.pow(zoomPopupCanvasCenterX_forFunnel - originalClusterCenterX, 2) +
        Math.pow(zoomPopupCanvasCenterY_forFunnel - originalClusterCenterY, 2)
    );

    if (d <= Math.abs(R1 - R2)) {
        console.warn("Círculos sobrepostos ou internos — sem tangentes externas.");
        return;
    }

    const theta = Math.atan2(
        zoomPopupCanvasCenterY_forFunnel - originalClusterCenterY,
        zoomPopupCanvasCenterX_forFunnel - originalClusterCenterX
    );

    const gamma = Math.acos((R1 - R2) / d);

    // Tangentes no círculo 1 (cluster)
    const start1X = originalClusterCenterX + R1 * Math.cos(theta + gamma);
    const start1Y = originalClusterCenterY + R1 * Math.sin(theta + gamma);
    const start2X = originalClusterCenterX + R1 * Math.cos(theta - gamma);
    const start2Y = originalClusterCenterY + R1 * Math.sin(theta - gamma);

    // Tangentes no círculo 2 (popup)
    const end1X = zoomPopupCanvasCenterX_forFunnel + R2 * Math.cos(theta + gamma);
    const end1Y = zoomPopupCanvasCenterY_forFunnel + R2 * Math.sin(theta + gamma);
    const end2X = zoomPopupCanvasCenterX_forFunnel + R2 * Math.cos(theta - gamma);
    const end2Y = zoomPopupCanvasCenterY_forFunnel + R2 * Math.sin(theta - gamma);

    ctx.save();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;

    // Círculo em volta do cluster
    ctx.beginPath();
    ctx.arc(originalClusterCenterX, originalClusterCenterY, R1, 0, Math.PI * 2);
    ctx.stroke();

    // Tangente 1
    ctx.beginPath();
    ctx.moveTo(start1X, start1Y);
    ctx.lineTo(end1X, end1Y);
    ctx.stroke();

    // Tangente 2
    ctx.beginPath();
    ctx.moveTo(start2X, start2Y);
    ctx.lineTo(end2X, end2Y);
    ctx.stroke();

    ctx.restore();
}, 50);


            // --- End Funnel Effect Drawing ---
		}

        // Function to draw an arrow from a node to the popup
        function drawArrowFromNodeToPopup(nodeCanvasX, nodeCanvasY, popupX, popupY, popupWidth, popupHeight) {
            ctx.save(); // Save the current canvas state

            // Calculate popup center in canvas coordinates
            const popupCenterX = popupX + popupWidth / 2;
            const popupCenterY = popupY + popupHeight / 2;

            // Draw arrow line
            ctx.beginPath();
            ctx.moveTo(nodeCanvasX, nodeCanvasY);
            ctx.lineTo(popupCenterX, popupCenterY);
            ctx.strokeStyle = '#4f46e5'; // Blue color for the arrow
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw arrowhead (simple triangle)
            const angle = Math.atan2(popupCenterY - nodeCanvasY, popupCenterX - nodeCanvasX);
            const arrowHeadLength = 10;
            const arrowHeadWidth = 7;

            ctx.beginPath();
            ctx.moveTo(popupCenterX, popupCenterY);
            ctx.lineTo(
                popupCenterX - arrowHeadLength * Math.cos(angle - Math.PI / 6),
                popupCenterY - arrowHeadLength * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
                popupCenterX - arrowHeadLength * Math.cos(angle + Math.PI / 6),
                popupCenterY - arrowHeadLength * Math.sin(angle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fillStyle = '#4f46e5'; // Same color as line
            ctx.fill();

            ctx.restore(); // Restore the canvas state
        }


        // Functions for the stage modal (now drawn on canvas)
        function drawStagePopup(stage, nodeCanvasX, nodeCanvasY) {
            const canvasWidth = mountainCanvas.width;
            const canvasHeight = mountainCanvas.height;

            const popupWidth = canvasWidth * 0.40; // Increased to 40%
            const popupHeight = canvasHeight * 0.40; // Increased to 40%
            const padding = 20; // Increased padding inside the popup

            let popupX, popupY;
            const offset = NODE_RADIUS * 2.5; // Increased offset to avoid collision with the node

            // Determine closest corner of the canvas to the clicked node
            const isTopHalf = nodeCanvasY < canvasHeight / 2;
            const isLeftHalf = nodeCanvasX < canvasWidth / 2;

            // Initial positioning based on closest corner
            if (isTopHalf && isLeftHalf) { // Top-Left
                popupX = 0;
                popupY = 0;
            } else if (isTopHalf && !isLeftHalf) { // Top-Right
                popupX = canvasWidth - popupWidth;
                popupY = 0;
            } else if (!isTopHalf && isLeftHalf) { // Bottom-Left
                popupX = 0;
                popupY = canvasHeight - popupHeight;
            } else { // Bottom-Right
                popupX = canvasWidth - popupWidth;
                popupY = canvasHeight - popupHeight;
            }

            // Adjust position to avoid collision with the node
            // Check if the popup would overlap with the node
            const nodeLeft = nodeCanvasX - NODE_RADIUS;
            const nodeRight = nodeCanvasX + NODE_RADIUS;
            const nodeTop = nodeCanvasY - NODE_RADIUS;
            const nodeBottom = nodeCanvasY + NODE_RADIUS;

            let potentialPopupX = popupX;
            let potentialPopupY = popupY;

            // Try to shift horizontally first
            if (isLeftHalf) { // Try placing to the right of the node
                potentialPopupX = nodeRight + offset;
                if (potentialPopupX + popupWidth > canvasWidth) { // If it goes off screen, try left
                    potentialPopupX = nodeLeft - offset - popupWidth;
                }
            } else { // Try placing to the left of the node
                potentialPopupX = nodeLeft - offset - popupWidth;
                if (potentialPopupX < 0) { // If it goes off screen, try right
                    potentialPopupX = nodeRight + offset;
                }
            }

            // If horizontal shift still causes overlap or is off-screen, try vertical shift
            const currentPopupRight = potentialPopupX + popupWidth;
            const currentPopupBottom = potentialPopupY + popupHeight;

            const overlapsAfterHorizontalShift = (nodeLeft < currentPopupRight && nodeRight > potentialPopupX) &&
                                                 (nodeTop < currentPopupBottom && nodeBottom > potentialPopupY);

            if (overlapsAfterHorizontalShift) {
                if (isTopHalf) { // Try placing below the node
                    potentialPopupY = nodeBottom + offset;
                    if (potentialPopupY + popupHeight > canvasHeight) { // If off screen, try above
                        potentialPopupY = nodeTop - offset - popupHeight;
                    }
                } else { // Try placing above the node
                    potentialPopupY = nodeTop - offset - popupHeight;
                    if (potentialPopupY < 0) { // If off screen, try below
                        potentialPopupY = nodeBottom + offset;
                    }
                }
            }

            // Final check to ensure popup stays within canvas bounds
            popupX = Math.max(0, Math.min(canvasWidth - popupWidth, potentialPopupX));
            popupY = Math.max(0, Math.min(canvasHeight - popupHeight, potentialPopupY));


            // Store active popup info
            activeStagePopup = { stage, nodeCanvasX, nodeCanvasY, popupX, popupY, popupWidth, popupHeight };

            // Draw popup background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // White with some transparency
            ctx.strokeStyle = '#e2e8f0'; // Light grey border
            ctx.lineWidth = 2;
            ctx.beginPath(); // Start a new path for the rectangle
            ctx.rect(popupX, popupY, popupWidth, popupHeight); // Draw a rectangle
            ctx.closePath(); // Close the path
            ctx.fill();
            ctx.stroke();

            // Draw close button (x)
            const closeButtonSize = 30; // Larger close button
            const closeButtonPadding = 10;
            const closeButtonX = popupX + popupWidth - closeButtonSize - closeButtonPadding;
            const closeButtonY = popupY + closeButtonPadding;

            ctx.fillStyle = '#a0aec0'; // Gray color for the close button
            ctx.font = 'bold 32px Arial'; // Larger font for close button
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('x', closeButtonX + closeButtonSize / 2, closeButtonY + closeButtonSize / 2);

            // Add clickable area for close button
            clickableAreas.push({
                type: 'closeStagePopup',
                xMin: closeButtonX,
                xMax: closeButtonX + closeButtonSize,
                yMin: closeButtonY,
                yMax: closeButtonY + closeButtonSize
            });


            // Draw text content
            ctx.fillStyle = '#333';
            ctx.font = 'bold 22px "Inter", sans-serif'; // Larger font for title
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`Etapa: ${stage.etapa}`, popupX + padding, popupY + padding);

            ctx.font = '18px "Inter", sans-serif'; // Larger font for details
            ctx.fillText(`Dificuldade: ${stage.dificuldade}`, popupX + padding, popupY + padding + 40); // Adjusted Y
            ctx.fillText(`Responsavel: ${stage.responsavel}`, popupX + padding, popupY + padding + 70); // Adjusted Y

            // Display raw data (simplified for canvas)
            ctx.font = '16px monospace'; // Larger font for raw data
            const rawDataString = JSON.stringify(stage, null, 2);
            const lines = rawDataString.split('\n');
            let currentY = popupY + padding + 100; // Adjusted Y
            lines.forEach(line => {
                ctx.fillText(line, popupX + padding, currentY);
                currentY += 20; // Increased line height
            });

            // Draw the arrow
            drawArrowFromNodeToPopup(nodeCanvasX, nodeCanvasY, popupX, popupY, popupWidth, popupHeight);
        }

        // Function to open the stage modal (now drawn on canvas)
        function openModalForStage(stage, nodeCanvasX, nodeCanvasY) {
            closeZoomPopup(); // Close zoom popup if open
            drawStagePopup(stage, nodeCanvasX, nodeCanvasY);
        }

        // Function to close the stage modal (now drawn on canvas)
        function closeStagePopup() {
            activeStagePopup = null; // Clear active popup info
            // Redraw the entire canvas to clear the popup and arrow
            if (currentPolygon) {
                desenharPoligonoETrilha(currentPolygon, showContourCheckbox.checked, showCostLabelsCheckbox.checked);
            } else {
                ctx.clearRect(0, 0, mountainCanvas.width, mountainCanvas.height);
                ctx.drawImage(img, 0, 0, mountainCanvas.width, mountainCanvas.height);
            }
        }


        // Shows the loading spinner and disables buttons
        function showLoading() {
            const loadingSpinner = document.getElementById('loadingSpinner'); // Ensure loadingSpinner is accessible
            loadingSpinner.style.display = 'block';
            processImageBtn.disabled = true;
            imageUpload.disabled = true;
            loadTrailDataBtn.disabled = true;
        }

        // Hides the loading spinner and enables buttons
        function hideLoading() {
            const loadingSpinner = document.getElementById('loadingSpinner'); // Ensure loadingSpinner is accessible
            loadingSpinner.style.display = 'none';
            processImageBtn.disabled = false;
            imageUpload.disabled = false;
            loadTrailDataBtn.disabled = false;
        }

        // Loads trail data from the textarea input
        function loadTrailDataFromInput() {
            const inputString = trailDataInput.value;
            try {
                const parsedData = JSON.parse(inputString);

                // Basic validation for the JSON structure
                if (!parsedData || typeof parsedData !== 'object' || !parsedData.processo || !Array.isArray(parsedData.etapas)) {
                    showValidationMessage('Erro de validação: A estrutura JSON esperada não foi encontrada (ex: "processo", "etapas").');
                    return;
                }

                // Detailed validation for each stage
                for (const stage of parsedData.etapas) {
                    if (typeof stage.id !== 'number' || typeof stage.etapa !== 'string' || typeof stage.dificuldade !== 'string' || typeof stage.responsavel !== 'string') {
                        showValidationMessage(`Erro de validação: Etapa com ID ${stage.id} tem propriedades ausentes ou com tipo incorreto.`);
                        return;
                    }
                    if (stage.custo && typeof stage.custo !== 'string') {
                        showValidationMessage(`Erro de validação: Custo da etapa com ID ${stage.id} deve ser uma string.`);
                        return;
                    }
                    if (stage.custo) {
                        const edgeStrings = stage.custo.split(';');
                        for (const edgeStr of edgeStrings) {
                            const parts = edgeStr.split('=');
                            if (parts.length !== 2) {
                                showValidationMessage(`Erro de validação: Formato de custo inválido "${edgeStr}" na etapa ${stage.id}. Esperado "origem-destino=custo".`);
                                return;
                            }
                            const [nodePair, costValue] = parts;
                            const nodeIds = nodePair.split('-');
                            if (nodeIds.length !== 2 || isNaN(Number(nodeIds[0])) || isNaN(Number(nodeIds[1])) || isNaN(Number(costValue))) {
                                showValidationMessage(`Erro de validação: Valores de custo ou IDs de nó inválidos em "${edgeStr}" na etapa ${stage.id}.`);
                                return;
                            }
                        }
                    }
                }

                trailData = parsedData;
                hideTrailDataValidationMessage(); // Corrected function call
                showMessage('Dados da trilha carregados com sucesso! Clique em "Processar Imagem" para redesenhar.', 'success');
                // Redraw if a polygon is already loaded
                if (currentPolygon) {
                    desenharPoligonoETrilha(currentPolygon, showContourCheckbox.checked, showCostLabelsCheckbox.checked);
                }

            } catch (e) {
                showValidationMessage(`Erro ao analisar JSON: ${e.message}. Por favor, verifique a sintaxe.`);
            }
        }

        // Displays validation messages for the trail data input
        function showValidationMessage(msg) {
            trailDataValidationMessage.textContent = msg;
            trailDataValidationMessage.style.display = 'block';
        }

        // Hides validation messages
        function hideTrailDataValidationMessage() { // Renamed function
            trailDataValidationMessage.style.display = 'none';
        }

        // Event listener for image file selection
        imageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                hideMessage();
                const reader = new FileReader();
                reader.onload = (event) => {
                    img.onload = () => {
                        mountainCanvas.width = img.width;
                        mountainCanvas.height = img.height;
                        ctx.clearRect(0, 0, mountainCanvas.width, mountainCanvas.height);
                        ctx.drawImage(img, 0, 0, img.width, img.height);
                        showMessage('Imagem carregada. Clique em "Processar" para detetar a trilha.', 'info');
                        // Automatically process if trail data is already loaded
                        if (trailData) {
                            processImageBtn.click();
                        }
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            } else {
                showMessage('Por favor, selecione uma imagem.', 'error');
            }
        });

        // Event listener for the "Process Image" button
        processImageBtn.addEventListener('click', async () => {
            if (!cvReady) {
                showMessage('OpenCV.js ainda não carregou. Por favor, aguarde.', 'error');
                return;
            }
            if (!imageUpload.files || imageUpload.files.length === 0) {
                showMessage('Por favor, carregue uma imagem primeiro.', 'error');
                return;
            }
            if (!trailData || trailData.etapas.length === 0) {
                showMessage('Por favor, carregue os dados da trilha primeiro ou use os dados padrão.', 'error');
                return;
            }

            showLoading();
            hideMessage();

            const file = imageUpload.files[0];
            const formData = new FormData();
            formData.append('image', file);

            try {
                // IMPORTANT: This application requires a Flask backend running at http://127.0.0.1:5000/
                // If you are encountering 'NetworkError when attempting to fetch resource.', please ensure:
                // 1. Your Flask server is running.
                // 2. The Flask server is configured to handle CORS requests from your HTML page's origin.
                //    (e.g., by using Flask-CORS: `from flask_cors import CORS; CORS(app)`)
                // 3. The URL below matches the address and port of your running Flask server.
                const response = await fetch('http://127.0.0.1:5000/', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Erro do servidor: ${response.statusText}`);
                }

                const data = await response.json();
                const processedImageUrl = data.result_image;
                const width = data.image_width;
                const height = data.image_height;
                const polygons = data.polygons;

                if (!processedImageUrl || !polygons || !width || !height) {
                    showMessage('Erro: Dados incompletos recebidos da API.', 'error');
                    return;
                }

				const imgProcessed = new Image();
				imgProcessed.crossOrigin = "anonymous"; // Needed for images loaded from different origins
				imgProcessed.onload = () => {
					mountainCanvas.width = width;
					mountainCanvas.height = height;
					ctx.clearRect(0, 0, width, height);
					ctx.drawImage(imgProcessed, 0, 0, img.width, img.height); // Draw the processed image

                    if (polygons.length > 0) {
                        currentPolygon = polygons[0]; // Assume the first polygon is the main one
                        desenharPoligonoETrilha(currentPolygon, showContourCheckbox.checked, showCostLabelsCheckbox.checked); 
                        showMessage('Trilha desenhada com sucesso!', 'success');
                    } else {
                        showMessage('Nenhum polígono detectado pela API.', 'error');
                    }
                };
                imgProcessed.src = `http://127.0.0.1:5000/${processedImageUrl}`; // Load the processed image from Flask
            } catch (e) {
                console.error("Erro ao comunicar com a API Flask:", e);
                showMessage(`Erro ao processar imagem: ${e.message}`, 'error');
            } finally {
                hideLoading();
            }
        });
        
        // Event listener for "Show Contour" checkbox
        showContourCheckbox.addEventListener('change', () => {
            if (currentPolygon) {
                desenharPoligonoETrilha(currentPolygon, showContourCheckbox.checked, showCostLabelsCheckbox.checked);
            }
        });

        // Event listener for "Show Cost Labels" checkbox
        showCostLabelsCheckbox.addEventListener('change', () => {
            if (currentPolygon) {
                desenharPoligonoETrilha(currentPolygon, showContourCheckbox.checked, showCostLabelsCheckbox.checked);
            }
        });

        // Function to draw the polygon and the trail nodes/edges
        function desenharPoligonoETrilha(poligono, showContour = false, showCostLabels = true) {
            ctx.clearRect(0, 0, mountainCanvas.width, mountainCanvas.height);
            ctx.drawImage(img, 0, 0, mountainCanvas.width, mountainCanvas.height);

            // Draw Cartesian grid if showContour is true
            if (showContour) {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'; // Light grey for grid lines
                ctx.lineWidth = 1;
                ctx.font = '10px Arial';
                ctx.fillStyle = 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const gridSize = 50; // Pixels per grid line

                // Draw vertical lines and X-axis labels
                for (let x = 0; x <= mountainCanvas.width; x += gridSize) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, mountainCanvas.height);
                    ctx.stroke();
                    ctx.fillText(x, x, 10); // X-axis labels at the top
                }

                // Draw horizontal lines and Y-axis labels
                for (let y = 0; y <= mountainCanvas.height; y += gridSize) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(mountainCanvas.width, y);
                    ctx.stroke();
                    ctx.fillText(y, 15, y); // Y-axis labels on the left
                }

                // Draw the polygon contour
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 3;
                ctx.beginPath();
                poligono.forEach(([x, y], i) => {
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.closePath();
                ctx.stroke();
            }
            
            // Map Y coordinates to their min/max X bounds within the polygon
            var yToXBounds = new Map(); // Changed from const to var
            poligono.forEach(([x, y]) => {
                const yi = Math.round(y);
                if (!yToXBounds.has(yi)) {
                    yToXBounds.set(yi, { minX: x, maxX: x });
                } else {
                    const b = yToXBounds.get(yi);
                    b.minX = Math.min(b.minX, x);
                    b.maxX = Math.max(b.maxX, x);
                }
            });

            drawTrailNodesAndEdgesContent(poligono, yToXBounds, showCostLabels); // Call the new content drawing function

            // Redraw active stage popup if it exists
            if (activeStagePopup) {
                drawStagePopup(activeStagePopup.stage, activeStagePopup.nodeCanvasX, activeStagePopup.nodeCanvasY);
            }
        }

        // New function to encapsulate the drawing logic that was previously directly in desenharPoligonoETrilha
        function drawTrailNodesAndEdgesContent(poligono, yToXBounds, showCostLabels) {
            clickableAreas = []; // Reset clickable areas
            const stages = trailData.etapas;
            if (stages.length === 0) {
                showMessage('Não há etapas para desenhar a trilha.', 'info');
                return;
            }

            nodes = new Map(); // Reset global nodes map
            edges = []; // Reset global edges array
            let totalCost = 0;

            // Populate nodes and edges from trailData
            for (const stage of stages) {
                nodes.set(stage.id, { stageData: stage, x: 0, y: 0 }); // Initialize node position
                if (stage.custo) {
                    const edgeStrings = stage.custo.split(';');
                    for (const edgeStr of edgeStrings) {
                        const parts = edgeStr.split('=');
                        if (parts.length === 2) {
                            const [nodePair, costStr] = parts;
                            const [sourceIdStr, destIdStr] = nodePair.split('-');
                            const sourceId = Number(sourceIdStr);
                            const destId = Number(destIdStr); 
                            const cost = Number(costStr);
                            if (!isNaN(sourceId) && !isNaN(destId) && !isNaN(cost)) {
                                edges.push({ sourceId, destId, cost });
                                totalCost += cost;
                            }
                        }
                    }
                }
            }

            // Determine overall min/max X/Y of the polygon
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            poligono.forEach(([x, y]) => {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            });

            // Find the lowest-leftmost point on the contour
            let lowestLeftPointOnContour = { x: minX, y: maxY };
            for (const point of poligono) {
                if (point[1] > lowestLeftPointOnContour.y || (point[1] === lowestLeftPointOnContour.y && point[0] < lowestLeftPointOnContour.x)) {
                    lowestLeftPointOnContour = { x: point[0], y: point[1] };
                }
            }

            // Find the highest-rightmost point on the contour
            let highestRightPointOnContour = { x: maxX, y: minY };
            for (const point of poligono) {
                if (point[1] < highestRightPointOnContour.y || (point[1] === highestRightPointOnContour.y && point[0] > highestRightPointOnContour.x)) {
                    highestRightPointOnContour = { x: point[0], y: point[1] };
                }
            }

            let finalNodeTargetX;
            let finalNodeTargetY;

            const allNodeIds = Array.from(nodes.keys()).sort((a, b) => a - b);
            const minId = allNodeIds[0];
            const maxId = allNodeIds[allNodeIds.length - 1];

            // Position the first node (minId) at the lowest-leftmost point
            let initialMinY = lowestLeftPointOnContour.y;
            nodes.get(minId).y = Math.max(minY, Math.min(maxY, initialMinY));
            let boundsMinY = yToXBounds.get(Math.round(nodes.get(minId).y));
            if (boundsMinY) {
                nodes.get(minId).x = boundsMinY.minX;
            } else {
                nodes.get(minId).x = minX;
            }

            // Position the last node (maxId) at the highest-rightmost point
            let initialMaxY = highestRightPointOnContour.y;
            nodes.get(maxId).y = Math.max(minY, Math.min(maxY, initialMaxY));
            let boundsMaxY = yToXBounds.get(Math.round(nodes.get(maxId).y));
            if (boundsMaxY) {
                nodes.get(maxId).x = boundsMaxY.maxX;
            } else {
                nodes.get(maxId).x = maxX;
            }

            finalNodeTargetX = nodes.get(maxId).x;
            finalNodeTargetY = nodes.get(maxId).y;

            const MAX_HEIGHT = nodes.get(minId).y - nodes.get(maxId).y;
            const num_vertical_steps = allNodeIds.length - 1;
            const MEASURE_UNIT = MAX_HEIGHT / (num_vertical_steps > 0 ? num_vertical_steps : 1);

            // Calculate total Euclidean distance between minId and maxId as a baseline
            const totalEuclideanDistance = Math.sqrt(
                Math.pow(nodes.get(maxId).x - nodes.get(minId).x, 2) +
                Math.pow(nodes.get(maxId).y - nodes.get(minId).y, 2)
            );

            // Make PIXEL_PER_COST_UNIT_EUCLIDEAN_NEW dynamic based on total path length and total cost
            const PIXEL_PER_COST_UNIT_EUCLIDEAN_NEW = totalCost > 0 ? totalEuclideanDistance / totalCost : 50;

            // Make ZIGZAG_NODE_OFFSET_MAGNITUDE dynamic based on PIXEL_PER_COST_UNIT_EUCLIDEAN_NEW
            const ZIGZAG_NODE_OFFSET_MAGNITUDE = PIXEL_PER_COST_UNIT_EUCLIDEAN_NEW * 1.5;

            const visitedNodes = new Set([minId]);
            const queue = [minId];

            const nodeZigzagSides = new Map();
            nodeZigzagSides.set(minId, 'right');
            nodeColors = new Map(); // Reset node colors map
            
            // Assign colors to nodes based on their ID
            allNodeIds.forEach((id, index) => {
                nodeColors.set(id, NODE_COLORS[index % NODE_COLORS.length]);
            });

            // Breadth-First Search (BFS) to position nodes
            while (queue.length > 0) {
                const currentSourceId = queue.shift();
                const currentSourcePos = nodes.get(currentSourceId);

                const outgoingEdges = edges.filter(e => e.sourceId === currentSourceId);

                for (const edge of outgoingEdges) {
                    const destId = edge.destId;
                    // Special handling for the last node
                    if (destId === maxId) {
                        if (!visitedNodes.has(destId)) {
                            visitedNodes.add(destId);
                            queue.push(destId);
                        }
                        continue;
                    }

                    if (!visitedNodes.has(destId)) {
                        let segmentLength = edge.cost * PIXEL_PER_COST_UNIT_EUCLIDEAN_NEW;

                        const angleToFinalTarget = Math.atan2(finalNodeTargetY - currentSourcePos.y, finalNodeTargetX - currentSourcePos.x);
                        
                        let idealTargetX = currentSourcePos.x + segmentLength * Math.cos(angleToFinalTarget);
                        let idealTargetY = currentSourcePos.y + segmentLength * Math.sin(angleToFinalTarget);

                        const currentSegmentZigzagSide = nodeZigzagSides.get(currentSourceId);
                        let offsetX = 0;
                        let offsetY = 0;

                        const dx_segment_ideal = idealTargetX - currentSourcePos.x;
                        const dy_segment_ideal = idealTargetY - currentSourcePos.y;
                        const segmentHypotenuse_ideal = Math.sqrt(dx_segment_ideal * dx_segment_ideal + dy_segment_ideal * dy_segment_ideal);

                        if (segmentHypotenuse_ideal > 0) {
                            if (currentSegmentZigzagSide === 'right') {
                                offsetX = -dy_segment_ideal / segmentHypotenuse_ideal * ZIGZAG_NODE_OFFSET_MAGNITUDE;
                                offsetY = dx_segment_ideal / segmentHypotenuse_ideal * ZIGZAG_NODE_OFFSET_MAGNITUDE;
                            } else {
                                offsetX = dy_segment_ideal / segmentHypotenuse_ideal * ZIGZAG_NODE_OFFSET_MAGNITUDE;
                                offsetY = -dx_segment_ideal / segmentHypotenuse_ideal * ZIGZAG_NODE_OFFSET_MAGNITUDE;
                            }
                        }
                        
                        idealTargetX += offsetX;
                        idealTargetY += offsetY;

                        let bestX = idealTargetX;
                        let bestY = idealTargetY;
                        let minDistanceToIdeal = Infinity;

                        // Search for the best position around the ideal target, prioritizing staying within bounds
                        const searchRange = Math.max(NODE_RADIUS * 2, ZIGZAG_NODE_OFFSET_MAGNITUDE * 0.5);
                        const startSearchY = Math.max(minY, Math.round(idealTargetY - searchRange));
                        const endSearchY = Math.min(maxY, Math.round(idealTargetY + searchRange));
                        const startSearchX = Math.max(minX, Math.round(idealTargetX - searchRange));
                        const endSearchX = Math.min(maxX, Math.round(idealTargetX + searchRange));

                        let foundValidPoint = false;
                        for (let y = startSearchY; y <= endSearchY; y++) {
                            const bounds = yToXBounds.get(y);
                            if (bounds) {
                                for (let x = Math.max(bounds.minX, startSearchX); x <= Math.min(bounds.maxX, endSearchX); x++) {
                                    const currentDistance = Math.sqrt(Math.pow(x - currentSourcePos.x, 2) + Math.pow(y - currentSourcePos.y, 2));
                                    const distanceDifference = Math.abs(currentDistance - segmentLength);

                                    if (distanceDifference < minDistanceToIdeal) {
                                        minDistanceToIdeal = distanceDifference;
                                        bestX = x;
                                        bestY = y;
                                        foundValidPoint = true;
                                    }
                                }
                            }
                        }

                        // Fallback if no point was found within the detailed search
                        if (!foundValidPoint) {
                            const closestYInBounds = Array.from(yToXBounds.keys()).reduce((prev, curr) =>
                                Math.abs(curr - idealTargetY) < Math.abs(prev - idealTargetY) ? curr : prev
                            );
                            const boundsAtClosestY = yToXBounds.get(closestYInBounds);
                            if (boundsAtClosestY) {
                                bestX = Math.max(boundsAtClosestY.minX, Math.min(boundsAtClosestY.maxX, idealTargetX));
                                bestY = closestYInBounds;
                            } else {
                                bestX = idealTargetX;
                                bestY = idealTargetY;
                                console.warn(`Fallback: No valid bounds found for any Y. Node might be outside polygon.`);
                            }
                        }

                        // Final clamp to ensure node is within overall polygon bounding box
                        bestX = Math.max(minX, Math.min(maxX, bestX));
                        bestY = Math.max(minY, Math.min(maxY, bestY));

                        nodes.get(destId).x = bestX;
                        nodes.get(destId).y = bestY;
                        visitedNodes.add(destId);
                        queue.push(destId);

                        nodeZigzagSides.set(destId, (currentSegmentZigzagSide === 'right') ? 'left' : 'right');
                    }
                }
            }

            // Draw Edges (using quadratic curves)
            ctx.lineWidth = 3;
			let curveDirectionToggle = 1; // 1 = right, -1 = left

            for (const edge of edges) {
				const startNode = nodes.get(edge.sourceId);
				const endNode = nodes.get(edge.destId);

				if (startNode && endNode) {
					const midX = (startNode.x + endNode.x) / 2;
					const midY = (startNode.y + endNode.y) / 2;

					const dx_line = endNode.x - startNode.x;
					const dy_line = endNode.y - startNode.y;
					const lineLength = Math.sqrt(dx_line * dx_line + dy_line * dy_line);

					let offsetX = 0;
					let offsetY = 0;
					const curveOffsetMagnitude = 80; // Magnitude of the curve offset

					if (lineLength > 0) {
						offsetX = -dy_line / lineLength * curveOffsetMagnitude * curveDirectionToggle;
						offsetY = dx_line / lineLength * curveOffsetMagnitude * curveDirectionToggle;
					}

					const controlPointX = midX + offsetX;
					const controlPointY = midY + offsetY;

					ctx.beginPath();
					ctx.moveTo(startNode.x, startNode.y);
					ctx.strokeStyle = nodeColors.get(startNode.stageData.id);
					ctx.quadraticCurveTo(controlPointX, controlPointY, endNode.x, endNode.y);
					ctx.stroke();

					curveDirectionToggle *= -1; // Toggle curve direction for next edge
				}
			}
			
			// Draw Nodes (Circles and Labels) on top of edges
			nodes.forEach((nodeData, id) => {
				if (nodeData.x !== undefined && nodeData.y !== undefined) {
					clickableAreas.push({
						stage: nodeData.stageData,
						xMin: nodeData.x - NODE_RADIUS,
						xMax: nodeData.x + NODE_RADIUS,
						yMin: nodeData.y - NODE_RADIUS,
						yMax: nodeData.y + NODE_RADIUS,
					});

					// Redraw the node circle over the curves
					ctx.beginPath();
					ctx.arc(nodeData.x, nodeData.y, NODE_RADIUS, 0, 2 * Math.PI);
					ctx.fillStyle = nodeColors.get(id);
					ctx.fill();

					// Draw node text
					ctx.fillStyle = '#333';
					ctx.font = '14px "Inter", sans-serif';
					ctx.textAlign = 'center';
					ctx.fillText(`ID: ${nodeData.stageData.id} - ${nodeData.stageData.etapa}`, nodeData.x, nodeData.y - NODE_RADIUS - 5);
				}
			});
		}


        // Set a placeholder image initially
        img.src = "https://placehold.co/600x400/a0aec0/ffffff?text=Carregue+sua+Montanha";

        // Initialize on window load
        window.onload = function () {
            // Set default trailData in the textarea on window load
            if (!trailDataInput.value) {
                trailDataInput.value = JSON.stringify(trailData, null, 2);
            }

            // Main canvas click event listener (for single node details)
            mountainCanvas.addEventListener('click', (e) => {
                const rect = mountainCanvas.getBoundingClientRect();
                const scaleX = mountainCanvas.width / rect.width;
                const scaleY = mountainCanvas.height / rect.height;
                const clickX = (e.clientX - rect.left) * scaleX;
                const clickY = (e.clientY - rect.top) * scaleY;

                // Check for close button click first
                for (const area of clickableAreas) {
                    if (area.type === 'closeStagePopup') {
                        // Check if click is within the close button's bounds
                        if (clickX >= area.xMin && clickX <= area.xMax && clickY >= area.yMin && clickY <= area.yMax) {
                            closeStagePopup();
                            return; // Stop processing further clicks
                        }
                    }
                }

                // If not the close button, check for node clicks
                for (const area of clickableAreas) {
                    // Only process areas that are nodes (i.e., have a 'stage' property)
                    if (area.stage) { // This ensures we are dealing with a node
                        // Calculate distance from click to node center
                        const nodeCenterX = area.xMin + NODE_RADIUS;
                        const nodeCenterY = area.yMin + NODE_RADIUS; 
                        const distanceToNodeCenter = Math.sqrt(Math.pow(clickX - nodeCenterX, 2) + Math.pow(clickY - nodeCenterY, 2));

                        if (distanceToNodeCenter <= NODE_RADIUS) { // Click is within this node's radius
                            // Now, check for collisions with other nodes based on their centers
                            const collidingGroup = clickableAreas.filter(a =>
                                a.stage && // Ensure 'a' is also a node
                                a !== area && // Exclude the clicked node itself
                                (() => {
                                    const otherNodeCenterX = a.xMin + NODE_RADIUS;
                                    const otherNodeCenterY = a.yMin + NODE_RADIUS;
                                    const distanceBetweenCenters = Math.sqrt(
                                        Math.pow(otherNodeCenterX - nodeCenterX, 2) +
                                        Math.pow(otherNodeCenterY - nodeCenterY, 2)
                                    );
                                    // Two circles collide if the distance between their centers is less than the sum of their radii
                                    return distanceBetweenCenters < (NODE_RADIUS + NODE_RADIUS);
                                })()
                            );

                            if (collidingGroup.length > 0) { // If there are other colliding nodes
                                // Add the clicked node to the group for the zoom popup
                                const fullCollidingCluster = [nodes.get(area.stage.id), ...collidingGroup.map(a => nodes.get(a.stage.id))];
                                openZoomPopup(fullCollidingCluster, e.clientX, e.clientY);
                            } else {
                                // No other colliding nodes, open modal for this single stage
                                openModalForStage(area.stage, clickX, clickY);
                            }
                            return; // Stop processing after handling a node click
                        }
                    }
                }
            });

            // Main canvas mousemove event listener (for zoom popup on collisions)
            mountainCanvas.addEventListener('mousemove', (e) => {
                const rect = mountainCanvas.getBoundingClientRect();
                const scaleX = mountainCanvas.width / rect.width;
                const scaleY = mountainCanvas.height / rect.height;
                const mouseX = (e.clientX - rect.left) * scaleX;
                const mouseY = (e.clientY - rect.top) * scaleY;

                let hoveredArea = null;
                for (const area of clickableAreas) {
                    const distance = Math.sqrt(Math.pow(mouseX - (area.xMin + NODE_RADIUS), 2) + Math.pow(mouseY - (area.yMin + NODE_RADIUS), 2));
                    if (distance <= NODE_RADIUS) {
                        hoveredArea = area;
                        break;
                    }
                }

                // Get the zoom modal element if it exists
                const zoomModalElement = document.getElementById('zoomModal');
                // Check if the mouse is currently over the zoom modal's content area
                const isMouseOverZoomModalContent = zoomModalElement && zoomModalElement.querySelector('#zoomContent')?.contains(e.target);

                if (hoveredArea) {
                    const nodeCenterX = hoveredArea.xMin + NODE_RADIUS;
                    const nodeCenterY = hoveredArea.yMin + NODE_RADIUS;

                    const collidingGroup = clickableAreas.filter(a => 
                        a.stage && // Ensure 'a' is a node
                        a !== hoveredArea && // Exclude the hovered node itself
                        (() => {
                            const otherNodeCenterX = a.xMin + NODE_RADIUS;
                            const otherNodeCenterY = a.yMin + NODE_RADIUS;
                            const distanceBetweenCenters = Math.sqrt(
                                Math.pow(otherNodeCenterX - nodeCenterX, 2) +
                                Math.pow(otherNodeCenterY - nodeCenterY, 2)
                            );
                            // Two circles collide if the distance between their centers is less than the sum of their radii
                            return distanceBetweenCenters < (NODE_RADIUS + NODE_RADIUS);
                        })()
                    );

                    if (collidingGroup.length > 0) {
                        // Set cursor to zoom-in when hovering over a colliding group
                        mountainCanvas.style.cursor = 'zoom-in';
                    } else {
                        // Set cursor to pointer for single (non-colliding) nodes
                        mountainCanvas.style.cursor = 'pointer';
                        // If mouse is over a single node or no collision, and zoom popup is open, close it
                        if (zoomPopupOpen && currentHoveredCluster && !isMouseOverZoomModalContent) {
                            closeZoomPopup();
                        }
                    }
                } else {
                    // Reset cursor to default when not hovering over any clickable area
                    mountainCanvas.style.cursor = 'default';

                    // If mouse is not over any node, and zoom popup is open, close it
                    if (zoomPopupOpen && currentHoveredCluster && !isMouseOverZoomModalContent) {
                        closeZoomPopup();
                    }
                }
            });

            // Add event listener for the load trail data button
            loadTrailDataBtn.addEventListener('click', loadTrailDataFromInput);

            // Global keydown event listener for 'Escape' key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    // Close stage modal if open
                    closeStagePopup();

                    // Close zoom modal if open
                    closeZoomPopup();
                }
            });
        };